// Preferences for gopls
const goplsConfig = require('../gopls.json');

// Extension commands
const commands = require('commands.js');

// Return an array of configuration property names that should be
// passed to the gopls initialization.
function goplsSettings() {
    var m = ['gopls-supported', 'gopls-experimental'].map((section) => {
        var cs = goplsConfig.find((i) => i.key === section);
        if (cs.children) {
            return cs.children.map((ci) => ci.key);
        }
        return [];
    });
    return m.reduce((acc, cv) => acc.concat(cv));
}

function goEnv(name) {
    var p = function (resolve, reject) {
        var options = {
            args: ['go', 'env', name],
        };
        var process = new Process('/usr/bin/env', options);
        lines = new Array();
        process.onStdout(function (line) {
            lines.push(line);
        });
        process.onDidExit(function (exitCode) {
            if (exitCode !== 0) {
                reject(`${options.args.join(' ')} exited ${exitCode}`);
            }
            resolve(lines.join('\n').trim());
        });
        process.start();
    };
    return new Promise(p);
}

// Return the full path an external tool, or undefined if the
// path isn't found, or isn't executable.
function toolPath(tool) {
    // First, just check the passed in argument.
    if (nova.fs.access(tool, nova.fs.R_OK, nova.fs.X_OK)) {
        return tool;
    }

    // No? Okay, then look in GOPATH, and then PATH
    var search = [];
    if (nova.environment['GOPATH']) {
        search.push([nova.environment['GOPATH'], 'bin'].join('/'));
    }
    search = search.concat(nova.environment['PATH'].split(':'));
    var found = search.find((val) => {
        return nova.fs.access(
            [val, tool].join('/'),
            nova.fs.R_OK,
            nova.fs.X_OK
        );
    });
    if (found) {
        return [found, tool].join('/');
    }
    return undefined;
}

function plog(prefix) {
    return (msg) => {
        console.info(`${prefix}: ${msg}`);
    };
}

// Language server instance
var gls = null;

exports.activate = function () {
    // Do work when the extension is activated.
    // GoLanguage server is a Disposable, so just register it with nova for the cleanup on deactivation.
    gls = new GoLanguageServer();
    gls.start().then(plog('activate')).catch(plog('activate fail'));
};

exports.deactivate = function () {
    // Clean up state before the extension is deactivated
    if (gls !== null) {
        gls.dispose();
        gls = null;
    }
};

class GoLanguageServer {
    constructor() {
        // Commands that span the life of the extension should
        // be added here, for reaping at disposal time.
        this.extCommands = new CompositeDisposable();

        this.extCommands.add(
            nova.commands.register('go.restartGopls', this.restart, this)
        );

        // Observe the configuration setting for the server's location, and restart the server on change
        nova.config.onDidChange(
            'go.gopls-path',
            function (current, previous) {
                // If the user deletes the value in the preferences and presses
                // return or tab, it will revert to the default of 'gopls'.
                // But on the way there, we get called once with with current === null
                // and again with current === previous, both of which we need to ignore.
                if (current && current != previous && this.goplsEnabled()) {
                    this.restart().then(plog('gopls path change'));
                }
            },
            this
        );

        nova.config.onDidChange(
            'go.gopls-enabled',
            function (enabled) {
                if (enabled) {
                    this.start().then(plog('enable')).catch(plog('enable fail'));
                } else {
                    this.stop().then(plog('disable')).catch(plog('disable fail'));
                }
            },
            this
        );

        // Restart on gopls configuration changes
        goplsSettings().forEach((opt) => {
            nova.config.onDidChange(opt, this.restart, this);
        });
    }

    dispose() {
        this.stop().then(plog('dispose')).catch('dispose fail');
        // this.extCommands.dispose();
    }

    start() {
        var t = this;
        var p = function (resolve, reject) {
            if (t.languageClient) {
                return resolve('gopls is already running');
            }

            if (!t.goplsEnabled()) {
                return reject('gopls is not enabled');
            }

            if (!nova.workspace.path) {
                return reject('The Nova workspace has no path!');
            }

            // Things with the lifespan of the LanguageClient go here
            t.lcCommands = new CompositeDisposable();

            // Create the client
            var serverOptions = {
                path: toolPath(nova.config.get('go.gopls-path', 'string')),
                args: ['serve'],
            };

            if (serverOptions.path === undefined) {
                nova.workspace.showWarningMessage(
                    `Cannot locate gopls.\n\nMake sure it installed in $GOPATH/bin, somewhere in $PATH, or provide the full path in the ${nova.extension.name} extension config.`
                );
                return reject('cannot locate gopls');
            }

            console.log('Using gopls:', serverOptions.path);

            if (nova.inDevMode()) {
                serverOptions.args = serverOptions.args.concat([
                    '-rpc.trace',
                    '-logfile',
                    '/tmp/gopls.log',
                ]);
            }

            var clientOptions = {
                // The set of document syntaxes for which the server is valid
                syntaxes: ['go'],
                initializationOptions: {},
            };
            // Set gopls configuration
            goplsSettings().forEach((opt) => {
                clientOptions.initializationOptions[opt] = nova.config.get(opt);
            });

            var client = new LanguageClient(
                'gopls',
                'gopls',
                serverOptions,
                clientOptions
            );

            try {
                // Start the client
                client.start();

                // Add the client to the subscriptions to be cleaned up
                t.lcCommands.add(client);
                t.languageClient = client;

                // Add extension commands dependent on gopls
                t.lcCommands.add(
                    nova.commands.register('go.organizeImports', (editor) =>
                        commands.OrganizeImports(editor, client)
                    )
                );
                t.lcCommands.add(
                    nova.commands.register('go.formatFile', (editor) =>
                        commands.FormatFile(editor, client)
                    )
                );
                t.lcCommands.add(
                    nova.commands.register('go.findReferences', (editor) =>
                        commands.FindReferences(editor, client)
                    )
                );
                t.lcCommands.add(
                    nova.commands.register('go.findImplementations', (editor) =>
                        commands.FindImplementations(editor, client)
                    )
                );
                t.lcCommands.add(
                    nova.commands.register('go.findTypeDefinition', (editor) =>
                        commands.FindTypeDefinition(editor, client)
                    )
                );
            } catch (err) {
                return reject(err);
            }

            // Look for the language server to be running.
            var tries = 10;
            var i = setInterval(() => {
                if (t && t.languageClient && t.languageClient.running) {
                    clearInterval(i);
                    resolve('gopls is running');
                }
                if (tries < 1) {
                    reject('gopls failed to start');
                }
                tries = tries - 1;
            }, 50);
        };
        return new Promise(p);
    }

    stop() {
        var t = this;
        var p = function (resolve) {
            if (t.languageClient) {
                t.languageClient.onDidStop((err) => {
                    if (err) {
                        // As of Nova 2.0, gopls does not cleanly shut down
                        // because Nova sends an empty parameters object to
                        // the lsp shutdown command rather than null, as per
                        // the lsp spec.
                        console.log(`ignoring gopls exit: ${err}`);
                    }
                    resolve('gopls stopped');
                });
                t.languageClient.stop();
                t.lcCommands.remove(t.languageClient);
                t.lcCommands.dispose();
                t.languageClient = null;
                t.lcCommands = null;
            } else {
                resolve('gopls is not running');
            }
        };
        return new Promise(p);
    }

    restart() {
        var t = this;
        return t
            .stop()
            .then(() => {
                return t.start();
            })
            .then(plog('restart'))
            .catch(plog('restart fail'));
    }

    client() {
        return this.languageClient;
    }

    goplsEnabled() {
        return nova.config.get('go.gopls-enabled', 'boolean');
    }
}

// The minimum supported Nova version
const minNova = 2;

// Preferences for gopls
const goplsConfig = require('../gopls.json');

// Extension commands
const commands = require('commands.js');

// Return an array of configuration property names that should be
// passed to the gopls initialization.
function goplsSettings() {
    let m = ['gopls-supported', 'gopls-experimental'].map((section) => {
        let cs = goplsConfig.find((i) => i.key === section);
        if (cs.children) {
            return cs.children.map((ci) => ci.key);
        }
        return [];
    });
    return m.reduce((acc, cv) => acc.concat(cv));
}

// console.log doesn't go anywhere during deactivation
var logFile = null;
function logger(message) {
    if (!nova.inDevMode()) {
        if (!logFile) {
            logFile = nova.fs.open('/tmp/gonova.log', 'a');
            logFile.write('\n\n');
        }
        logFile.write(`${Date.now()}  ${message}\n`);
    } else {
        console.info(message);
    }
}

function goEnv(name, cb) {
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
            console.error(`${options.args.join(' ')} exited ${exitCode}`);
        }
        cb(lines.join('\n').trim());
    });
    process.start();
}

// Return the full path an external tool, or undefined if the
// path isn't found, or isn't executable.
function toolPath(tool) {
        // First, just check the passed in argument.
        if (nova.fs.access(tool, nova.fs.R_OK, nova.fs.X_OK)) {
            return tool;
        }

        // No? Okay, then look in GOPATH, and then PATH
        let search = [];
        if (nova.environment['GOPATH']) {
            search.push([nova.environment['GOPATH'], 'bin'].join('/'));
        }
        search = search.concat(nova.environment['PATH'].split(':'));
        let found = search.find((val) => {
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

// Language server instance
var gls = null;

exports.activate = function () {
    // Do work when the extension is activated.
    // GoLanguage server is a Disposable, so just register it with nova for the cleanup on deactivation.
    logger('Activate');
    if (nova.version[0] < minNova) {
        nova.workspace.showWarningMessage(
            `Language Server functionality requires Nova ${minNova}.`
        );
        return;
    }
    gls = new GoLanguageServer();
};

exports.deactivate = function () {
    // Clean up state before the extension is deactivated
    logger('Deactivate');
    if (gls !== null) {
        gls.dispose();
        gls = null;
    }
};

class GoLanguageServer {
    constructor() {
        logger('GoLanguageServer.constructor()');

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
                    console.info('Restarting gopls due to path change');
                    this.restart();
                }
            },
            this
        );

        nova.config.observe(
            'go.gopls-enabled',
            function (enabled) {
                logger(`observing gopls to be ${enabled}`);
                if (enabled) {
                    this.start();
                } else {
                    this.stop();
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
        logger('GoLanguageServer.dispose()');
        this.stop();
        this.extCommands.dispose();
    }

    start() {
        logger('GoLanguageServer.start()');
        if (this.languageClient) {
            logger('gopls is already running');
            return;
        }

        if (!this.goplsEnabled()) {
            logger('gopls is not enabled');
            return;
        }

        if (!nova.workspace.path) {
            console.error('The Nova workspace has no path!');
            return;
        }

        // Things with the lifespan of the LanguageClient go here
        this.lcCommands = new CompositeDisposable();

        // Create the client
        var serverOptions = {
            path: toolPath(nova.config.get('go.gopls-path', 'string')),
            args: ['serve'],
        };

        if (serverOptions.path === undefined) {
            nova.workspace.showWarningMessage(
                `Cannot locate gopls.\n\nMake sure it installed in $GOPATH/bin, somewhere in $PATH, or provide the full path in the ${nova.extension.name} extension config.`
            );
            return;
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
            this.lcCommands.add(client);
            this.languageClient = client;

            // Add extension commands dependent on gopls
            this.lcCommands.add(
                nova.commands.register('go.organizeImports', (editor) =>
                    commands.OrganizeImports(editor, client)
                )
            );
            this.lcCommands.add(
                nova.commands.register('go.formatFile', (editor) =>
                    commands.FormatFile(editor, client)
                )
            );
            this.lcCommands.add(
                nova.commands.register('go.findReferences', (editor) =>
                    commands.FindReferences(editor, client)
                )
            );
            this.lcCommands.add(
                nova.commands.register('go.findImplementations', (editor) =>
                    commands.FindImplementations(editor, client)
                )
            );
            this.lcCommands.add(
                nova.commands.register('go.findTypeDefinition', (editor) =>
                    commands.FindTypeDefinition(editor, client)
                )
            );
        } catch (err) {
            // If the .start() method throws, it's likely because the path to the language server is invalid

            if (nova.inDevMode()) {
                console.error('start error', err);
            }
        }
    }

    stop() {
        logger('GoLanguageServer.stop()');
        if (this.languageClient) {
            this.languageClient.stop();
            this.lcCommands.remove(this.LanguageClient);
            this.lcCommands.dispose();
            this.languageClient = null;
            this.lcCommands = null;
        }
    }

    restart() {
        logger('GoLanguageServer.restart()');
        if (this.LanguageClient === null || this.languageClient === undefined) {
            this.start();
            return;
        }
        this.languageClient.onDidStop((err) => {
            console.log(`gopls exit ${err}`);
            this.start();
        }, this);
        this.stop();
    }

    client() {
        return this.languageClient;
    }

    goplsEnabled() {
        return nova.config.get('go.gopls-enabled', 'boolean');
    }
}

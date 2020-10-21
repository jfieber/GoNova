// console.log doesn't go anywhere during deactivation
var logFile = null;
function logger(message) {
    if (!logFile) {
        logFile = nova.fs.open('/tmp/gonova.log', 'a');
        logFile.write('\n\n');
    }
    logFile.write(`${Date.now()}  ${message}\n`);
}

const commands = require('commands.js');

var gls = null;

exports.activate = function () {
    // Do work when the extension is activated.
    // GoLanguage server is a Disposable, so just register it with nova for the cleanup on deactivation.
    logger('Activate');
    gls = new GoLanguageServer();
    // nova.subscriptions.add(gls);
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
            nova.commands.register('go.startGopls', this.start, this)
        );
        this.extCommands.add(
            nova.commands.register('go.stopGopls', this.stop, this)
        );
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

        this.lcCommands = new CompositeDisposable();

        // Create the client
        var serverOptions = {
            path: this.goplsPath() || 'gopls',
            args: ['serve'],
        };

        // An absolute path or use the search path?
        if (serverOptions.path.charAt(0) !== '/') {
            serverOptions.args.unshift(serverOptions.path);
            serverOptions.path = '/usr/bin/env';
        }

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
        };
        var client = new LanguageClient(
            'gopls',
            'Go Please',
            serverOptions,
            clientOptions
        );

        try {
            // Start the client
            client.start();

            // Add the client to the subscriptions to be cleaned up
            nova.subscriptions.add(client);
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
            this.lcCommands.dispose();
            this.lcCommands = null;
            nova.subscriptions.remove(this.languageClient);
            this.languageClient = null;
        }
    }

    restart() {
        logger('GoLanguageServer.restart()');
        this.stop();
        let self = this;
        setTimeout(function () {
            self.start();
        }, 2000);
    }

    client() {
        return this.languageClient;
    }

    goplsPath() {
        return nova.config.get('go.gopls-path', 'string');
    }

    goplsEnabled() {
        return nova.config.get('go.gopls-enabled', 'boolean');
    }
}

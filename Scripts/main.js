// console.log doesn't go anywhere during deactivation
var logFile = null;
function logger(message) {
    if (!logFile) {
        logFile = nova.fs.open('/tmp/gonova.log', 'a');
        logFile.write('\n\n');
    }
    logFile.write(`${Date.now()}  ${message}\n`);
}

exports.activate = function () {
    // Do work when the extension is activated.
    // GoLanguage server is a Disposable, so just register it with nova for the cleanup on deactivation.
    logger('Activate');
    nova.subscriptions.add(new GoLanguageServer());
};

exports.deactivate = function () {
    // Clean up state before the extension is deactivated
    logger('Deactivate');
};

function testLcCommand() {
    logger('testLcCommand');
}

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
        nova.config.observe(
            'go.gopls-path',
            function (path) {
                this.restart(path);
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

        if (!nova.workspace.path) {
            console.error('The Nova workspace has no path!');
            return;
        }

        this.lcCommands = new CompositeDisposable();

        // Create the client
        var serverOptions = {
            path: this.goplsPath(),
            args: ['serve'],
        };
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
                nova.commands.register('go.testLcCommand', testLcCommand)
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

    goplsPath() {
        return nova.config.get('go.gopls-path', 'string');
    }
}

// Extension commands
const commands = require('commands.js');

// gopls utilities
const gopls = require('gopls.js');

// Append an extension config/command name to the extension prefix
function exItem(name) {
    return [nova.extension.identifier, name].join('.');
}

function plog(prefix) {
    return (msg) => {
        console.info(`${prefix}: ${msg}`);
    };
}

// Language server instance
var gls = null;

exports.activate = () => {
    // Do work when the extension is activated.
    gls = new GoLanguageServer();
    gls.start().then(plog('activate')).catch(plog('activate warning'));
};

exports.deactivate = () => {
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
            nova.commands.register(
                exItem('cmd.restartGopls'),
                this.restart,
                this
            )
        );

        this.extCommands.add(
            nova.commands.register(
                exItem('cmd.installGopls'),
                commands.InstallGopls
            )
        );

        // Observe the configuration setting for the server's location, and restart the server on change
        nova.config.onDidChange(exItem('gopls-path'), (current, previous) => {
            // If the user deletes the value in the preferences and presses
            // return or tab, it will revert to the default of 'gopls'.
            // But on the way there, we get called once with with current === null
            // and again with current === previous, both of which we need to ignore.
            if (current && current != previous && gopls.Enabled()) {
                this.restart()
                    .then(plog('gopls path change'))
                    .catch(plog('gopls restart failed after path change'));
            }
        });

        nova.config.onDidChange(exItem('gopls-enabled'), (enabled) => {
            if (enabled) {
                this.start().then(plog('enable')).catch(plog('enable fail'));
            } else {
                this.stop().then(plog('disable')).catch(plog('disable fail'));
            }
        });

        nova.config.onDidChange(exItem('gopls-trace'), (current) => {
            this.restart()
                .then(plog(`gopls-trace set to ${current}`))
                .catch(plog(`gopls-trace restart fail`));
        });
    }

    dispose() {
        this.stop().then(plog('dispose')).catch('dispose fail');
        // this.extCommands.dispose();
    }

    start() {
        return new Promise((resolve, reject) => {
            if (this.languageClient) {
                return resolve('gopls is already running');
            }

            if (!gopls.Enabled()) {
                return reject('gopls is not enabled');
            }

            if (!nova.workspace.path) {
                return reject('The Nova workspace has no path!');
            }

            // Things with the lifespan of the LanguageClient go here
            this.lcCommands = new CompositeDisposable();

            // Create the client
            var serverOptions = {
                path: gopls.ToolPath(
                    nova.config.get(exItem('gopls-path'), 'string')
                ),
                args: ['serve'],
            };

            if (serverOptions.path === undefined) {
                nova.workspace.showWarningMessage(
                    `Cannot locate gopls.\n\nMake sure it installed in $GOPATH/bin, somewhere in $PATH, or provide the full path in the ${nova.extension.name} extension config.`
                );
                return reject('cannot locate gopls');
            }
            if (nova.config.get(exItem('gopls-trace'), 'boolean')) {
                console.log('gopls rpc tracing is enabled');
                serverOptions.args = serverOptions.args.concat(['-rpc.trace']);
            }
            console.log('server options:', JSON.stringify(serverOptions));

            var clientOptions = {
                // The set of document syntaxes for which the server is valid
                syntaxes: ['go'],
                initializationOptions: gopls.Settings(),
            };
            console.log('client options:', JSON.stringify(clientOptions));

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
                    nova.commands.register(
                        exItem('cmd.organizeImports'),
                        (editor) => commands.OrganizeImports(editor, client)
                    )
                );
                this.lcCommands.add(
                    nova.commands.register(exItem('cmd.formatFile'), (editor) =>
                        commands.FormatFile(editor, client)
                    )
                );
                this.lcCommands.add(
                    nova.commands.register(
                        exItem('cmd.findReferences'),
                        (editor) => commands.FindReferences(editor, client)
                    )
                );
                this.lcCommands.add(
                    nova.commands.register(
                        exItem('cmd.findImplementations'),
                        (editor) => commands.FindImplementations(editor, client)
                    )
                );
                this.lcCommands.add(
                    nova.commands.register(
                        exItem('cmd.findDefinition'),
                        (editor) => commands.FindDefinition(editor, client)
                    )
                );
                this.lcCommands.add(
                    nova.commands.register(
                        exItem('cmd.findTypeDefinition'),
                        (editor) => commands.FindTypeDefinition(editor, client)
                    )
                );
                this.lcCommands.add(
                    nova.commands.register(exItem('cmd.jumpBack'), (editor) =>
                        commands.JumpBack(editor, client)
                    )
                );
            } catch (err) {
                return reject(err);
            }

            // Look for the language server to be running.
            var tries = 10;
            var i = setInterval(() => {
                if (
                    this &&
                    this.languageClient &&
                    this.languageClient.running
                ) {
                    clearInterval(i);
                    resolve('gopls is running');
                }
                if (tries < 1) {
                    reject('gopls failed to start');
                }
                tries = tries - 1;
            }, 50);
        });
    }

    stop() {
        return new Promise((resolve) => {
            if (this.languageClient) {
                this.languageClient.onDidStop((err) => {
                    if (err) {
                        // As of Nova 2.0, gopls does not cleanly shut down
                        // because Nova sends an empty parameters object to
                        // the lsp shutdown command rather than null, as per
                        // the lsp spec.
                        console.log(`ignoring gopls exit: ${err}`);
                    }
                    resolve('gopls stopped');
                });
                this.languageClient.stop();
                this.lcCommands.remove(this.languageClient);
                this.lcCommands.dispose();
                this.languageClient = null;
                this.lcCommands = null;
            } else {
                resolve('gopls is not running');
            }
        });
    }

    restart() {
        return this.stop()
            .then(() => {
                return this.start();
            })
            .then(plog('restart'))
            .catch(plog('restart fail'));
    }

    client() {
        return this.languageClient;
    }
}

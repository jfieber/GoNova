// Extension commands
const commands = require('commands.js');
const tasks = require('tasks.js');
const ext = require('ext.js');

// gopls utilities
const gopls = require('gopls.js');
const lsp = require('lsp.js');

// Language server instance
var gls = null;

exports.activate = () => {
    // tasks.CreateTasks();
    gls = new GoLanguageServer();
    gls.start().then(ext.plog('activate')).catch(ext.plog('activate warning'));
};

exports.deactivate = () => {
    if (gls !== null) {
        gls.deactivate();
        gls = null;
    }
};

class GoLanguageServer {
    constructor() {
        nova.commands.register(
            ext.ns('cmd.installGopls'),
            (workspace) => commands.InstallGopls(workspace, this),
            this
        );
        nova.commands.register(ext.ns('cmd.restartGopls'), this.restart, this);

        // Observe the configuration setting for the server's location, and restart the server on change
        nova.config.onDidChange(ext.ns('gopls-path'), (current, previous) => {
            // If the user deletes the value in the preferences and presses
            // return or tab, it will revert to the default of 'gopls'.
            // But on the way there, we get called once with with current === null
            // and again with current === previous, both of which we need to ignore.
            if (current && current != previous) {
                this.restart()
                    .then(ext.plog('gopls path change'))
                    .catch(ext.plog('gopls restart failed after path change'));
            }
        });

        nova.config.onDidChange(ext.ns('gopls-trace'), (current) => {
            this.restart()
                .then(ext.plog(`gopls-trace set to ${current}`))
                .catch(ext.plog(`gopls-trace restart fail`));
        });
    }

    deactivate() {
        this.stop().then(ext.plog('deactivate')).catch('deactivate fail');
    }

    start() {
        return new Promise(async (resolve, reject) => {
            if (this.languageClient) {
                return resolve('gopls is already running');
            }
            if (!nova.workspace.path) {
                return reject('The Nova workspace has no path!');
            }

            // console.log(`Go version: ${await gopls.GoVersion()}`);
            // console.log(`Go Path: ${await gopls.GoEnv('GOPATH')}`);

            // Find gopls
            let vp = await gopls.Version();
            if (vp.path === undefined) {
                nova.workspace.showWarningMessage(
                    `Cannot locate gopls.\n\nMake sure it installed in $GOPATH/bin, somewhere in $PATH, or provide the full path in the ${nova.extension.name} extension config.`
                );
                return reject('cannot locate gopls');
            }
            console.info(`gopls version: ${JSON.stringify(vp)}`);

            // LanguageClient server options
            var serverOptions = {
                path: vp.path,
                args: ['serve'],
            };
            if (nova.config.get(ext.ns('gopls-trace'), 'boolean')) {
                console.log('gopls rpc tracing is enabled');
                serverOptions.args = serverOptions.args.concat(['-rpc.trace']);
            }
            console.log('server options:', JSON.stringify(serverOptions));

            // LanguageClient client options
            var clientOptions = {
                syntaxes: ['go'],
            };
            console.log('client options:', JSON.stringify(clientOptions));

            var client = new LanguageClient(
                'gopls',
                'gopls',
                serverOptions,
                clientOptions
            );

            try {
                client.start();
                nova.subscriptions.add(client);
                this.languageClient = client;
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
                    this.registerCommands();
                    this.registerHooks();
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
                nova.subscriptions.remove(this.languageClient);
                this.languageClient = null;
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
            .then(ext.plog('restart'))
            .catch(ext.plog('restart fail'));
    }

    // Register extension commands that depend on the language client
    registerCommands() {
        if (!this.lcCommandsRegistered) {
            nova.commands.register(
                ext.ns('cmd.organizeImports'),
                (editor) =>
                    commands.OrganizeImports(editor, this.languageClient),
                this
            );
            nova.commands.register(
                ext.ns('cmd.formatFile'),
                (editor) => commands.FormatFile(editor, this.languageClient),
                this
            );
            nova.commands.register(
                ext.ns('cmd.findReferences'),
                (editor) =>
                    commands.FindReferences(editor, this.languageClient),
                this
            );
            nova.commands.register(
                ext.ns('cmd.findImplementations'),
                (editor) =>
                    commands.FindImplementations(editor, this.languageClient),
                this
            );
            nova.commands.register(
                ext.ns('cmd.findDefinition'),
                (editor) =>
                    commands.FindDefinition(editor, this.languageClient),
                this
            );
            nova.commands.register(
                ext.ns('cmd.findTypeDefinition'),
                (editor) =>
                    commands.FindTypeDefinition(editor, this.languageClient),
                this
            );
            nova.commands.register(
                ext.ns('cmd.jumpBack'),
                (editor) => commands.JumpBack(editor, this.languageClient),
                this
            );
            this.lcCommandsRegistered = true;
            console.log('Registered language client commands');
        } else {
            console.log('Language client commands are already registered');
        }
    }

    registerHooks() {
        if (!this.lcHooksRegistered) {
            nova.workspace.onDidAddTextEditor((editor) => {
                editor.onDidSave(() => {
                    console.log('Saved complete');
                });
                editor.onWillSave((editor) => {
                    if (editor.document.syntax === 'go') {
                        if (nova.config.get(ext.ns('fmtsave'))) {
                            console.info('fmtsave entry');
                            return commands
                                .FormatFile(editor, this.languageClient)
                                .then(() => {
                                    console.info('fmtsave done');
                                });
                        }
                    }
                }, this);
            }, this);
            this.lcHooksRegistered = true;
            console.log('Registered language client hooks');
        } else {
            console.log('Hooks already registered');
        }
    }
}

// Extension commands
import * as commands from './commands';
// import * as tasks from "./tasks";
import * as ext from './ext';

// gopls utilities
import * as gopls from './gopls';
// import * as lsp from "./lsp";

// Language server instance
var gls: GoLanguageServer;

export function activate() {
    // tasks.CreateTasks();
    gls = new GoLanguageServer();
    gls.start().then(ext.plog('activate')).catch(ext.plog('activate warning'));
}

export function deactivate() {
    if (gls !== null) {
        gls.deactivate();
        // gls = null;
    }
}

class GoLanguageServer {
    private languageClient: any;
    private lcHooksRegistered: boolean = false;
    private lcCommandsRegistered: boolean = false;

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
    }

    deactivate() {
        this.stop()
            .then(ext.plog('deactivate'))
            .catch(ext.plog('deactivate fail'));
    }

    start(): Promise<string> {
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
            if (!vp.path) {
                nova.workspace.showWarningMessage(
                    `Cannot locate gopls.\n\nMake sure it installed in $GOPATH/bin, somewhere in $PATH, or provide the full path in the ${nova.extension.name} extension config.`
                );
                return reject('cannot locate gopls');
            }
            console.info(`gopls version: ${JSON.stringify(vp)}`);

            // LanguageClient server options
            var serverOptions: ServerOptions = {
                path: vp.path,
                args: ['serve'],
            };
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
                // nova.subscriptions.add(client);
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

    stop(): Promise<string> {
        return new Promise((resolve) => {
            if (this.languageClient) {
                this.languageClient.onDidStop((err: string) => {
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

    async restart(): Promise<string> {
        return this.stop().then(() => {
            return this.start();
        });
        // .then(ext.plog('restart'))
        // .catch(ext.plog('restart fail'));
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
                () => commands.JumpBack(),
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
                editor.onWillSave(async (editor) => {
                    if (editor.document.syntax === 'go') {
                        if (nova.config.get(ext.ns('fmtsave'))) {
                            console.log('format on save...');
                            await commands.FormatFile(
                                editor,
                                this.languageClient
                            );
                            console.log('format on save done');
                        }
                        if (nova.config.get(ext.ns('impsave'))) {
                            console.log('organizing imports on save...');
                            await commands.OrganizeImports(
                                editor,
                                this.languageClient
                            );
                            console.log('organizing imports on save done');
                        }
                    }
                });
            });
            this.lcHooksRegistered = true;
            console.log('Registered language client hooks');
        } else {
            console.log('Hooks already registered');
        }
    }
}

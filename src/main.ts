// Extension commands
import * as commands from './commands';
import * as config from './config';

// gopls utilities
import * as gopls from './gopls';

// Language server instance
var gls: GoLanguageServer | null = null;

export function activate() {
    console.log('activating extension');
    gls = new GoLanguageServer();
    gls.start();
}

export async function deactivate() {
    console.log('deactivating extension');
    if (gls !== null) {
        await gls.stop();
        gls = null;
    }
}

class GoLanguageServer {
    private languageClient: any;
    private lcCommandsRegistered: boolean = false;

    constructor() {
        this.registerCommands();

        // Observe for when the preferences for either the go or gopls paths change
        // and restart the language server.
        let self = this;
        config.watch(config.keys.GoPath, (name, value) => {
            console.log(`${name} changed to ${value}`);
            self.restart();
        });
        config.watch(config.keys.GoplsPath, (name, value) => {
            console.log(`${name} changed to ${value}`);
            self.restart();
        });
    }

    start(): Promise<void> {
        return new Promise(async (resolve, reject) => {
            console.log('starting gopls...');
            if (this.languageClient) {
                console.log('gopls is already running');
                return resolve();
            }
            if (!nova.workspace.path) {
                console.error('The Nova workspace has no path!');
                return reject();
            }

            // Find go
            let go = await gopls.GoVersion();
            if (!go.version || !go.path) {
                nova.workspace.showWarningMessage(
                    `Cannot locate go\n\nMake sure it is installed somewhere in $PATH, or provide the full path in the ${nova.extension.name} extension config.`
                );
                return reject();
            }
            console.log(`Using go ${go.version} at path ${go.path}`);

            // Find gopls
            let vp = await gopls.GoplsVersion();
            if (!vp.path) {
                nova.workspace.showWarningMessage(
                    `Cannot locate gopls.\n\nMake sure it installed in $GOPATH/bin, somewhere in $PATH, or provide the full path in the ${nova.extension.name} extension config.`
                );
                return reject();
            }
            console.log(`Using gopls ${vp.version} at path ${vp.path}`);

            // LanguageClient server options
            var serverOptions: ServerOptions = {
                path: vp.path,
                args: ['serve'],
                env: {
                    PATH: [
                        nova.path.dirname(go.path),
                        nova.environment['PATH'],
                    ].join(':'),
                },
            };

            console.log('server options:', JSON.stringify(serverOptions));

            // LanguageClient client options
            var clientOptions = {
                syntaxes: ['go', 'go-mod'],
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
                this.languageClient = client;
                nova.subscriptions.add(this.languageClient);
            } catch (err) {
                console.error('error starting gopls', err);
                return reject();
            }

            // Look for the language server to be running.
            var tries = 10;
            var i = setInterval(() => {
                if (client && client.running) {
                    console.log('gopls started successfully');
                    clearInterval(i);
                    resolve();
                }
                if (tries < 1) {
                    clearInterval(i);
                    console.error('gopls failed to start');
                    this.languageClient.stop();
                    nova.subscriptions.remove(this.languageClient);
                    this.languageClient = null;
                    reject();
                }
                tries = tries - 1;
            }, 50);
        });
    }

    stop(): Promise<void> {
        return new Promise((resolve) => {
            console.log('stopping gopls...');
            if (this.languageClient) {
                this.languageClient.onDidStop((err: string) => {
                    if (err) {
                        // As of Nova 2.0, gopls does not cleanly shut down
                        // because Nova sends an empty parameters object to
                        // the lsp shutdown command rather than null, as per
                        // the lsp spec.
                        console.log(`ignoring gopls exit: ${err}`);
                    }
                    console.log('gopls stopped successfully');
                    resolve();
                });
                this.languageClient.stop();
                nova.subscriptions.remove(this.languageClient);
                this.languageClient = null;
            } else {
                console.log(`gopls is already stopped`);
                resolve();
            }
        });
    }

    async restart(): Promise<void> {
        await this.stop();
        return this.start();
    }

    // Register extension commands that depend on the language client
    registerCommands() {
        if (this.lcCommandsRegistered) {
            console.log('commands and hooks are already registered');
            return;
        }

        console.log('registering commands and hooks');

        //
        // Workspace commands
        //
        nova.commands.register(config.ns('cmd.goplsInstall'), (workspace) =>
            commands.InstallGopls(workspace, this)
        );
        nova.commands.register(config.ns('cmd.goplsStart'), this.start, this);
        nova.commands.register(config.ns('cmd.goplsStop'), this.stop, this);
        nova.commands.register(
            config.ns('cmd.goplsRestart'),
            this.restart,
            this
        );

        //
        // Editor commands
        //
        nova.commands.register(config.ns('cmd.organizeImports'), (editor) =>
            commands.OrganizeImports(editor, this.languageClient)
        );
        nova.commands.register(config.ns('cmd.formatFile'), (editor) =>
            commands.FormatFile(editor, this.languageClient)
        );
        nova.commands.register(config.ns('cmd.findReferences'), (editor) =>
            commands.FindReferences(editor, this.languageClient)
        );
        nova.commands.register(config.ns('cmd.findImplementations'), (editor) =>
            commands.FindImplementations(editor, this.languageClient)
        );
        nova.commands.register(config.ns('cmd.findDefinition'), (editor) =>
            commands.FindDefinition(editor, this.languageClient)
        );
        nova.commands.register(config.ns('cmd.findTypeDefinition'), (editor) =>
            commands.FindTypeDefinition(editor, this.languageClient)
        );
        nova.commands.register(config.ns('cmd.jumpBack'), () =>
            commands.JumpBack()
        );

        //
        // Hooks
        //
        nova.workspace.onDidAddTextEditor((editor) => {
            editor.onWillSave(async (editor) => {
                if (
                    editor.document.syntax === 'go' ||
                    editor.document.syntax === 'go-mod'
                ) {
                    if (config.get(config.keys.FmtSave)) {
                        console.log('format on save...');
                        await commands.FormatFile(editor, this.languageClient);
                        console.log('format on save done');
                    }
                }
                if (editor.document.syntax === 'go') {
                    if (config.get(config.keys.ImpSave)) {
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

        this.lcCommandsRegistered = true;
    }
}

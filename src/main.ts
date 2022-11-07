// Extension commands
import * as commands from './commands';
import * as ext from './ext';

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

        // Observe the configuration setting for the server's location, and restart the
        // server on change.
        //
        // Quirks:
        //
        // If the user deletes the value in the preferences and presses
        // return or tab, it will revert to the default of 'gopls'.
        // But on the way there, we get called once with with current === null
        // and again with current === previous, both of which we need to ignore.
        //
        // And sometimes we get called a bunch of times with the same value. So
        // store a value outside of config and only restart if the value actually
        // changes. The previous value passed by the hook is of no use to us.
        var goplsPath = nova.config.get(ext.ns('gopls-path'), 'string');
        nova.config.onDidChange(
            ext.ns('gopls-path'),
            async (current: string, _: string) => {
                if (current && current != goplsPath) {
                    console.log(
                        `restarting for gopls path change to ${current}`
                    );
                    goplsPath = current;
                    this.restart();
                }
            }
        );
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

            // Find gopls
            let vp = await gopls.Version();
            if (!vp.path) {
                nova.workspace.showWarningMessage(
                    `Cannot locate gopls.\n\nMake sure it installed in $GOPATH/bin, somewhere in $PATH, or provide the full path in the ${nova.extension.name} extension config.`
                );
                return reject();
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
        nova.commands.register(ext.ns('cmd.goplsInstall'), (workspace) =>
            commands.InstallGopls(workspace, this)
        );
        nova.commands.register(ext.ns('cmd.goplsStart'), this.start, this);
        nova.commands.register(ext.ns('cmd.goplsStop'), this.stop, this);
        nova.commands.register(ext.ns('cmd.goplsRestart'), this.restart, this);

        //
        // Editor commands
        //
        nova.commands.register(ext.ns('cmd.organizeImports'), (editor) =>
            commands.OrganizeImports(editor, this.languageClient)
        );
        nova.commands.register(ext.ns('cmd.formatFile'), (editor) =>
            commands.FormatFile(editor, this.languageClient)
        );
        nova.commands.register(ext.ns('cmd.findReferences'), (editor) =>
            commands.FindReferences(editor, this.languageClient)
        );
        nova.commands.register(ext.ns('cmd.findImplementations'), (editor) =>
            commands.FindImplementations(editor, this.languageClient)
        );
        nova.commands.register(ext.ns('cmd.findDefinition'), (editor) =>
            commands.FindDefinition(editor, this.languageClient)
        );
        nova.commands.register(ext.ns('cmd.findTypeDefinition'), (editor) =>
            commands.FindTypeDefinition(editor, this.languageClient)
        );
        nova.commands.register(ext.ns('cmd.jumpBack'), () =>
            commands.JumpBack()
        );

        //
        // Hooks
        //
        nova.workspace.onDidAddTextEditor((editor) => {
            editor.onWillSave(async (editor) => {
                if (editor.document.syntax === 'go') {
                    if (nova.config.get(ext.ns('fmtsave'))) {
                        console.log('format on save...');
                        await commands.FormatFile(editor, this.languageClient);
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

        this.lcCommandsRegistered = true;
    }
}

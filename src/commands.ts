import type * as lspTypes from 'vscode-languageserver-protocol';
import * as gopls from './gopls';
import * as lsp from './lsp';

type jumpLoc = {
    uri: string;
    range: Range;
};

class JumpStack {
    private jumpStack: Array<jumpLoc>;

    constructor() {
        this.jumpStack = [];
    }

    push() {
        const uri = nova.workspace.activeTextEditor?.document.uri;
        const range = nova.workspace.activeTextEditor?.selectedRange;
        if (uri && range) {
            this.jumpStack.push({
                uri: uri,
                range: range,
            });
        }
    }

    pop() {
        const p = this.jumpStack.pop();
        if (p) {
            const foo: jumpLoc = p;
            nova.workspace
                .openFile(foo.uri)
                .then((targetEditor) => {
                    if (!targetEditor) {
                        throw 'no target editor';
                    }
                    targetEditor.selectedRange = p.range;
                    targetEditor.scrollToCursorPosition();
                })
                .catch((err) => {
                    console.error(`Failed to pop ${err}`);
                });
        } else {
            console.log('jump stack is empty');
        }
    }
}

var js = new JumpStack();

export function JumpBack() {
    js.pop();
}

// Check if a language client is available and log if not
function lcCheck(lclient: LanguageClient): boolean {
    if (!lclient) {
        console.log('language server is not running');
        return false;
    }
    return true;
}

export function InstallGopls(workspace: Workspace, gls: any) {
    workspace.showInputPanel(
        'Specify gopls version to install',
        {
            label: 'Version',
            placeholder: 'latest',
            value: 'latest',
        },
        async (iversion) => {
            if (iversion) {
                const notification_id = 'gopls-update';
                let msgInstalling = new NotificationRequest(notification_id);
                msgInstalling.title = 'Installing gopls';
                msgInstalling.body = `Installing gopls version ${iversion}…`;
                nova.notifications.add(msgInstalling);
                try {
                    const v = await gopls.GoplsInstall(iversion);
                    let imsg = `Installed gopls ${v.version} at ${v.path}`;
                    nova.notifications.cancel(notification_id);
                    workspace.showInformativeMessage(imsg);
                    gls.restart();
                } catch (e: any) {
                    workspace.showInformativeMessage(
                        `Error installing gopls:\n\n${e.stderr}`
                    );
                }
            }
        }
    );
}

export async function OrganizeImports(
    editor: TextEditor,
    lclient: LanguageClient
) {
    if (lcCheck(lclient)) {
        var cmd = 'textDocument/codeAction';
        var cmdArgs = {
            textDocument: {
                uri: editor.document.uri,
            },
            range: lsp.RangeToLspRange(editor.document, editor.selectedRange),
            context: { diagnostics: [] },
        };
        const response = await lclient.sendRequest(cmd, cmdArgs);
        if (Array.isArray(response)) {
            for (const action of response) {
                if (action.kind === 'source.organizeImports') {
                    console.info(`Performing actions for ${action.kind}`);
                    for (const tde of action.edit.documentChanges) {
                        await lsp.ApplyTextDocumentEdit(tde);
                    }
                } else {
                    console.info(`Skipping action ${action.kind}`);
                }
            }
        }
    }
}

export async function FormatFile(editor: TextEditor, lclient: LanguageClient) {
    if (lcCheck(lclient)) {
        var cmd = 'textDocument/formatting';
        var cmdArgs = {
            textDocument: {
                uri: editor.document.uri,
            },
            options: {},
        };
        const response = await lclient.sendRequest(cmd, cmdArgs);
        if (Array.isArray(response)) {
            await lsp.ApplyTextEdits(editor, response);
        }
    }
}

export function FindReferences(editor: TextEditor, lclient: LanguageClient) {
    findX(editor, lclient, 'textDocument/references', {
        includeDeclaration: true,
    });
}

export function FindImplementations(
    editor: TextEditor,
    lclient: LanguageClient
) {
    findX(editor, lclient, 'textDocument/implementation');
}

export function FindDefinition(editor: TextEditor, lclient: LanguageClient) {
    findX(editor, lclient, 'textDocument/definition');
}

export function FindTypeDefinition(
    editor: TextEditor,
    lclient: LanguageClient
) {
    findX(editor, lclient, 'textDocument/typeDefinition');
}

// Run assorted jump-to-related-entity commands
function findX(
    editor: TextEditor,
    lclient: LanguageClient,
    command: string,
    params?: object
) {
    if (lcCheck(lclient)) {
        var origin = lsp.RangeToLspRange(editor.document, editor.selectedRange);
        if (!origin || !origin.start) {
            nova.workspace.showWarningMessage(
                "Couldn't figure out what you've selected."
            );
            return;
        }

        var cmdArgs = {
            textDocument: {
                uri: editor.document.uri,
            },
            position: origin.start,
        };

        if (typeof params === 'object') {
            Object.assign(cmdArgs, params);
        }

        lclient
            .sendRequest(command, cmdArgs)
            .then((response) => {
                if (Array.isArray(response)) {
                    multiJump(response);
                }
            })
            .catch((err) => {
                console.error(`${command} error!:`, err);
            });
    }
}

// Jump to an LSP Location
// https://microsoft.github.io/language-server-protocol/specifications/specification-current/#location
function jumpTo(lspLocation: lspTypes.Location) {
    if (lspLocation === undefined || lspLocation === null) {
        console.error('jumpTo(): no jump target specified!');
    }
    js.push();
    nova.workspace
        .openFile(lspLocation.uri)
        .then((targetEditor) => {
            if (!targetEditor) {
                throw 'no target editor';
            }
            targetEditor.selectedRange = lsp.LspRangeToRange(
                targetEditor.document,
                lspLocation.range
            );
            targetEditor.scrollToCursorPosition();
        })
        .catch((err) => {
            console.info('Failed in the jump', err);
        });
}

type titleLocation = {
    title: string;
    location: lspTypes.Location;
};

// Jump to an LSP Location after presenting a list of Locations to the user.
// https://microsoft.github.io/language-server-protocol/specifications/specification-current/#location
function multiJump(lspLocations: Array<lspTypes.Location>) {
    if (!Array.isArray(lspLocations)) {
        console.error(`multiJump: input is not an array`);
        return;
    }

    // Jump directly of there is only one target
    if (lspLocations.length === 1) {
        jumpTo(lspLocations[0]);
        return;
    }

    // Otherwise fix up the UI label for the choice palette
    let labeled = lspLocations.map((target): titleLocation => {
        return {
            location: target,
            title:
                nova.workspace.relativizePath(
                    target.uri.replace(`file://`, '')
                ) +
                ` ${target.range.start.line + 1}:${
                    target.range.start.character + 1
                }`,
        };
    });

    nova.workspace.showChoicePalette(
        labeled.map((x) => x.title),
        {},
        (selected) => {
            if (selected !== null) {
                let target = labeled.find((r) => {
                    return r['title'] === selected;
                });
                if (target !== undefined) {
                    jumpTo(target.location);
                }
            }
        }
    );
}

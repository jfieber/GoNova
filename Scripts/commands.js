const lsp = require('lsp.js');
const gopls = require('gopls.js');

class JumpStack {
    constructor() {
        this.jumpStack = [];
    }

    push() {
        this.jumpStack.push({
            uri: nova.workspace.activeTextEditor.document.uri,
            range: nova.workspace.activeTextEditor.selectedRange,
        });
    }

    pop() {
        let p = this.jumpStack.pop();
        if (p) {
            nova.workspace
                .openFile(p.uri)
                .then((targetEditor) => {
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

exports.JumpBack = () => {
    js.pop();
};

exports.InstallGopls = (workspace, gls) => {
    workspace.showInputPanel(
        'Specify gopls version to install',
        {
            label: 'Version',
            placeholder: 'latest',
            value: 'latest',
        },
        (iversion) => {
            if (iversion) {
                gopls
                    .Install(iversion)
                    .then((v) => {
                        let imsg = `Installed gopls ${v.version} at ${v.path}`;
                        if (!gopls.Enabled()) {
                            let emsg = `The language server is not enabled. Enable it now?`;
                            workspace.showActionPanel(
                                [imsg, emsg].join('\n\n'),
                                {
                                    buttons: ['Enable', 'Cancel'],
                                },
                                (i) => {
                                    if (i === 0) {
                                        gopls.Enable();
                                    }
                                }
                            );
                        } else {
                            workspace.showInformativeMessage(imsg);
                            if (gopls.Enabled()) {
                                gls.restart();
                            }
                        }
                    })
                    .catch((v) => {
                        workspace.showInformativeMessage(
                            `Error installing gopls:\n\n${v}`
                        );
                    });
            }
        }
    );
};

exports.OrganizeImports = (editor, lclient) => {
    if (lclient) {
        var cmd = 'textDocument/codeAction';
        var cmdArgs = {
            textDocument: {
                uri: editor.document.uri,
            },
            range: lsp.RangeToLspRange(editor.document, editor.selectedRange),
            context: { diagnostics: [] },
        };

        lclient
            .sendRequest(cmd, cmdArgs)
            .then((response) => {
                if (response !== null && response !== undefined) {
                    response.forEach((action) => {
                        if (action.kind === 'source.organizeImports') {
                            console.info(
                                `Performing actions for ${action.kind}`
                            );
                            action.edit.documentChanges.forEach((tde) => {
                                lsp.ApplyTextDocumentEdit(tde);
                            });
                        } else {
                            console.info(`Skipping action ${action.kind}`);
                        }
                    });
                }
            })
            .catch((err) => {
                console.error(`${cmd} error!:`, err);
            });
    }
};

exports.FormatFile = (editor, lclient) => {
    if (lclient) {
        var cmd = 'textDocument/formatting';
        var cmdArgs = {
            textDocument: {
                uri: editor.document.uri,
            },
            options: {},
        };
        lclient
            .sendRequest(cmd, cmdArgs)
            .then((response) => {
                if (response !== null && response !== undefined) {
                    lsp.ApplyTextEdits(editor, response);
                }
            })
            .catch((err) => {
                console.error(`${cmd} error!:`, err);
            });
    }
};

exports.FindReferences = (editor, lclient) => {
    findX(editor, lclient, 'textDocument/references', {
        includeDeclaration: true,
    });
};

exports.FindImplementations = (editor, lclient) => {
    findX(editor, lclient, 'textDocument/implementation');
};

exports.FindDefinition = (editor, lclient) => {
    findX(editor, lclient, 'textDocument/definition');
};

exports.FindTypeDefinition = (editor, lclient) => {
    findX(editor, lclient, 'textDocument/typeDefinition');
};

// Run assorted jump-to-related-entity commands
function findX(editor, lclient, command, params) {
    if (lclient) {
        var origin = lsp.RangeToLspRange(editor.document, editor.selectedRange);
        if (origin === undefined || !origin.start) {
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
                multiJump(response);
            })
            .catch((err) => {
                console.error(`${cmd} error!:`, err);
            });
    }
}

// Jump to an LSP Location
// https://microsoft.github.io/language-server-protocol/specifications/specification-current/#location
function jumpTo(lspLocation) {
    if (lspLocation === undefined || lspLocation === null) {
        console.error('jumpTo(): no jump target specified!');
    }
    js.push();
    nova.workspace
        .openFile(lspLocation.uri)
        .then((targetEditor) => {
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

// Jump to an LSP Location after presenting a list of Locations to the user.
// https://microsoft.github.io/language-server-protocol/specifications/specification-current/#location
function multiJump(lspLocations) {
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
    let labeled = lspLocations.map((target) => {
        target.title =
            nova.workspace.relativizePath(target.uri.replace(`file://`, '')) +
            ` ${target.range.start.line + 1}:${
                target.range.start.character + 1
            }`;
        return target;
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
                    jumpTo(target);
                }
            }
        }
    );
}

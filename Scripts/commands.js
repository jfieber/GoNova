const lsp = require('lsp.js');

exports.OrganizeImports = function (editor, lclient) {
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
            .catch(function (err) {
                console.error(`${cmd} error!:`, err);
            });
    }
};

exports.FormatFile = function (editor, lclient) {
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
            .catch(function (err) {
                console.error(`${cmd} error!:`, err);
            });
    }
};

exports.FindReferences = function (editor, lclient) {
    findX(editor, lclient, 'textDocument/references', {
        includeDeclaration: true,
    });
};

exports.FindImplementations = function (editor, lclient) {
    findX(editor, lclient, 'textDocument/implementation');
};

exports.FindTypeDefinition = function (editor, lclient) {
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
            .catch(function (err) {
                console.error(`${cmd} error!:`, err);
            });
    }
}

// Jump to an LSP Location
// https://microsoft.github.io/language-server-protocol/specifications/specification-current/#location
function jumpTo(lspLocation) {
    if (lspLocation === undefined || lspLocation === null) {
    }
    nova.workspace
        .openFile(lspLocation.uri)
        .then(function (targetEditor) {
            // When Nova first opens a file, the callback gets an undefined editor,
            // which is most likely a bug. Usually works the second time.
            if (targetEditor === undefined) {
                console.error('Failed to get TextEditor, will retry');
                nova.workspace
                    .openFile(lspLocation.uri)
                    .then(function (targetEditor) {
                        targetEditor.selectedRange = lsp.LspRangeToRange(
                            targetEditor.document,
                            lspLocation.range
                        );
                        targetEditor.scrollToCursorPosition();
                    })
                    .catch(function (err) {
                        console.error(
                            'Failed to get text editor on the second try',
                            err
                        );
                    });
            } else {
                targetEditor.selectedRange = lsp.LspRangeToRange(
                    targetEditor.document,
                    lspLocation.range
                );
                targetEditor.scrollToCursorPosition();
            }
        })
        .catch(function (err) {
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
            target.uri.replace(`file://${nova.workspace.path}/`, '') +
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

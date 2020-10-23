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
                // console.info(`${cmd} response:`, response);
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
                // console.info(`${cmd} response:`, response);
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
    if (lclient) {
        var selectedRange = editor.selectedRange;
        selectedPosition =
            (_a = lsp.RangeToLspRange(editor.document, selectedRange)) ===
                null || _a === void 0
                ? void 0
                : _a.start;
        if (!selectedPosition) {
            nova.workspace.showWarningMessage(
                "Couldn't figure out what you've selected."
            );
            return;
        }
        var cmd = 'textDocument/references';
        var cmdArgs = {
            textDocument: {
                uri: editor.document.uri,
            },
            position: selectedPosition,
            includeDeclaration: true,
        };
        lclient
            .sendRequest(cmd, cmdArgs)
            .then((response) => {
                console.info(`${cmd} response:`, response);
                if (response !== null && response !== undefined) {
                    jumpTo(response[0]);
                }
            })
            .catch(function (err) {
                console.error(`${cmd} error!:`, err);
            });
    }
};

exports.FindImplementations = function (editor, lclient) {
    if (lclient) {
        var selectedRange = editor.selectedRange;
        selectedPosition =
            (_a = lsp.RangeToLspRange(editor.document, selectedRange)) ===
                null || _a === void 0
                ? void 0
                : _a.start;
        if (!selectedPosition) {
            nova.workspace.showWarningMessage(
                "Couldn't figure out what you've selected."
            );
            return;
        }
        var cmd = 'textDocument/implementation';
        var cmdArgs = {
            textDocument: {
                uri: editor.document.uri,
            },
            position: selectedPosition,
        };
        lclient
            .sendRequest(cmd, cmdArgs)
            .then((response) => {
                console.info(`${cmd} response:`, response);
                if (response !== null && response !== undefined) {
                    jumpTo(response[0]);
                }
            })
            .catch(function (err) {
                console.error(`${cmd} error!:`, err);
            });
    }
};

function jumpTo(lspLocation) {
    // lspLocation is:
    //
    // {
    //     "uri":"file:///Volumes/adbe/go/src/git.corp.adobe.com/Stormcloud/assets-helper/stakeholder/handler.go",
    //     "range": {
    //         "start": {
    //             "line":96,
    //             "character":21
    //         },
    //         "end": {
    //             "line":96,
    //             "character":28
    //         }
    //     }
    // }
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

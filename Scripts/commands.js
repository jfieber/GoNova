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

exports.JumpToDefinition = function (editor, lclient) {
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
        var params = {
            textDocument: {
                uri: editor.document.uri,
            },
            position: selectedPosition,
        };
        var jump = lclient.sendRequest('textDocument/definition', params);
        // {"uri":"file:///opt/brew/Cellar/go@1.14/1.14.7/libexec/src/fmt/print.go","range":{"start":{"line":272,"character":5},"end":{"line":272,"character":12}}}

        jump.then(function (to) {
            if (to !== null) {
                if (to.length > 0) {
                    var target = to[0];
                    console.info('Jumping', JSON.stringify(to[0]));
                    nova.workspace
                        .openFile(target.uri)
                        .then(function (targetEditor) {
                            // When Nova first opens a file, the callback gets an undefined editor,
                            // which is most likely a bug. Usually works the second time.
                            if (targetEditor === undefined) {
                                console.error(
                                    'Failed to get TextEditor, will retry'
                                );
                                nova.workspace
                                    .openFile(target.uri)
                                    .then(function (targetEditor) {
                                        targetEditor.selectedRange = lsp.LspRangeToRange(
                                            targetEditor.document,
                                            target.range
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
                                    target.range
                                );
                                targetEditor.scrollToCursorPosition();
                            }
                        })
                        .catch(function (err) {
                            console.info('Failed in the jump', err);
                        });
                }
            }
        });
    }
};

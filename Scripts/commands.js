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

// Turn a Nova start-end range to an LSP row-column range.
// From https://github.com/apexskier/nova-typescript
exports.RangeToLspRange = (document, range) => {
    const fullContents = document.getTextInRange(new Range(0, document.length));
    let chars = 0;
    let startLspRange;
    const lines = fullContents.split(document.eol);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const lineLength = lines[lineIndex].length + document.eol.length;
        if (!startLspRange && chars + lineLength >= range.start) {
            const character = range.start - chars;
            startLspRange = { line: lineIndex, character };
        }
        if (startLspRange && chars + lineLength >= range.end) {
            const character = range.end - chars;
            return {
                start: startLspRange,
                end: { line: lineIndex, character },
            };
        }
        chars += lineLength;
    }
    return null;
};

// Turn an LSP row-column range to a Nova start-end range.
// From https://github.com/apexskier/nova-typescript
exports.LspRangeToRange = (document, range) => {
    const lines = document
        .getTextInRange(new Range(0, document.length))
        .split(document.eol);

    // Special case: the document doesn't end with an eol, an LSP range to append something
    // may be something like this, if the Nova file has 100 lines:
    //   {"range":{"start":{"line":100,"character":0},"end":{"line":100,"character":0}}
    if (range.start.line === lines.length) {
        return new Range(document.length, document.length);
    }

    let rangeStart = 0;
    let rangeEnd = 0;
    let offset = 0;
    for (let lineIndex = 0; lineIndex <= lines.length; lineIndex++) {
        if (range.start.line === lineIndex) {
            rangeStart = offset + range.start.character;
        }
        if (range.end.line === lineIndex) {
            rangeEnd = offset + range.end.character;
            break;
        }
        offset += lines[lineIndex].length + document.eol.length;
    }

    return new Range(rangeStart, rangeEnd);
};

// Apply a TextDocumentEdit
// https://microsoft.github.io/language-server-protocol/specifications/specification-current/#textDocumentEdit
exports.ApplyTextDocumentEdit = async (tde) => {
    if (tde && tde.textDocument && tde.edits) {
        try {
            editor = await nova.workspace.openFile(tde.textDocument.uri);
            await exports.ApplyTextEdits(editor, tde.edits);
        } catch (err) {
            console.error(`error opening file ${tde.textDocument.uri}: ${err}`);
        }
    } else {
        console.info('no edits to apply, it seems');
    }
};

// Apply a TextEdit[]
// https://microsoft.github.io/language-server-protocol/specifications/specification-current/#textEdit
exports.ApplyTextEdits = async (editor, edits) => {
    for (const e of edits.reverse()) {
        const r = exports.LspRangeToRange(editor.document, e.range);
        await editor.edit((tee) => {
            tee.replace(r, e.newText);
        });
    }
};

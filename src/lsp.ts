import type * as lspTypes from 'vscode-languageserver-protocol';

// Turn a Nova start-end range to an LSP row-column range.
// From https://github.com/apexskier/nova-typescript
export function RangeToLspRange(document: TextDocument, range: Range) {
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
}

// Turn an LSP row-column range to a Nova start-end range.
// From https://github.com/apexskier/nova-typescript
export function LspRangeToRange(document: TextDocument, range: lspTypes.Range) {
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
}

// Apply a TextDocumentEdit
// https://microsoft.github.io/language-server-protocol/specifications/specification-current/#textDocumentEdit
export async function ApplyTextDocumentEdit(tde: lspTypes.TextDocumentEdit) {
    if (tde && tde.textDocument && tde.edits) {
        try {
            const editor = await nova.workspace.openFile(tde.textDocument.uri);
            if (!editor) {
                throw 'no editor';
            }
            await ApplyTextEdits(editor, tde.edits);
        } catch (err) {
            console.error(`error opening file ${tde.textDocument.uri}: ${err}`);
        }
    } else {
        console.info('no edits to apply, it seems');
    }
}

// Apply a TextEdit[]
// https://microsoft.github.io/language-server-protocol/specifications/specification-current/#textEdit
export async function ApplyTextEdits(
    editor: TextEditor,
    edits: Array<lspTypes.TextEdit>
) {
    await editor.edit((tee) => {
        for (const e of edits.reverse()) {
            const r = LspRangeToRange(editor.document, e.range);
            tee.replace(r, e.newText);
        }
    });
}

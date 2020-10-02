var langserver = null

exports.activate = function () {
  // Do work when the extension is activated
  langserver = new GoLanguageServer()
}

exports.deactivate = function () {
  // Clean up state before the extension is deactivated
  if (langserver) {
    langserver.deactivate()
    langserver = null
  }
}

// Adapted from https://github.com/jonclayden/R-Nova/blob/master/R-Nova.novaextension/Scripts/main.js
class GoLanguageServer {
  constructor() {
    // Observe the configuration setting for the server's location, and restart the server on change
    nova.config.observe(
      'go-nova.gopls-path',
      function (path) {
        this.didChange()
      },
      this
    )

    nova.config.observe(
      'go-nova.enable-languageserver',
      function (value) {
        this.didChange()
      },
      this
    )
  }

  deactivate() {
    this.stop()
  }

  didChange() {
    if (nova.config.get('go-nova.enable-languageserver', 'boolean')) {
      this.start(nova.config.get('go-nova.gopls-path', 'string'))
    } else {
      this.stop()
    }
  }

  start(path) {
    if (this.languageClient) {
      this.languageClient.stop()
      nova.subscriptions.remove(this.languageClient)
    }

    // Basic server options
    var serverOptions = {
      path: path || 'gopls',
      args: ['serve'],
    }

    // An absolute path or use the search path?
    if (serverOptions.path.charAt(0) !== '/') {
      serverOptions.args.unshift(serverOptions.path)
      serverOptions.path = '/usr/bin/env'
    }

    if (nova.inDevMode()) {
      serverOptions.args = serverOptions.args.concat([
        '-rpc.trace',
        '-logfile',
        '/tmp/gopls.log',
      ])
    }

    var clientOptions = {
      // The set of document syntaxes for which the server is valid
      syntaxes: ['go'],
    }
    var client = new LanguageClient(
      'gopls',
      'Go Language Server',
      serverOptions,
      clientOptions
    )

    try {
      // Start the client
      client.start()

      // Add the client to the subscriptions to be cleaned up
      nova.subscriptions.add(client)
      this.languageClient = client
    } catch (err) {
      // If the .start() method throws, it's likely because the path to the language server is invalid

      if (nova.inDevMode()) {
        console.error(err)
      }
    }
  }

  stop() {
    if (this.languageClient) {
      this.languageClient.stop()
      nova.subscriptions.remove(this.languageClient)
      this.languageClient = null
    }
  }

  client() {
    return this.languageClient
  }
}

nova.commands.register('go.jumpToDefinition', (editor) => {
  if (
    langserver === null ||
    langserver.client() === null ||
    langserver.client() === undefined
  ) {
    console.info('gopls language server is not running')
    return
  }
  var selectedRange = editor.selectedRange
  selectedPosition =
    (_a = rangeToLspRange(editor.document, selectedRange)) === null ||
    _a === void 0
      ? void 0
      : _a.start
  if (!selectedPosition) {
    nova.workspace.showWarningMessage(
      "Couldn't figure out what you've selected."
    )
    return
  }
  var params = {
    textDocument: {
      uri: editor.document.uri,
    },
    position: selectedPosition,
  }
  var jump = langserver.client().sendRequest('textDocument/definition', params)
  // {"uri":"file:///opt/brew/Cellar/go@1.14/1.14.7/libexec/src/fmt/print.go","range":{"start":{"line":272,"character":5},"end":{"line":272,"character":12}}}

  jump.then(function (to) {
    if (to !== null) {
      if (to.length > 0) {
        var target = to[0]
        console.info('Jumping', JSON.stringify(to[0]))
        nova.workspace
          .openFile(target.uri)
          .then(function (targetEditor) {
            // When Nova first opens a file, the callback gets an undefined editor,
            // which is most likely a bug. Usually works the second time.
            if (targetEditor === undefined) {
              console.error('Failed to get TextEditor, will retry')
              nova.workspace
                .openFile(target.uri)
                .then(function (targetEditor) {
                  targetEditor.selectedRange = lspRangeToRange(
                    targetEditor.document,
                    target.range
                  )
                  targetEditor.scrollToCursorPosition()
                })
                .catch(function (err) {
                  console.error(
                    'Failed to get text editor on the second try',
                    err
                  )
                })
            } else {
              targetEditor.selectedRange = lspRangeToRange(
                targetEditor.document,
                target.range
              )
              targetEditor.scrollToCursorPosition()
            }
          })
          .catch(function (err) {
            console.info('Failed in the jump', err)
          })
      }
    }
  })
})

// Turn a Nova start-end range to an LSP row-column range.
// From https://github.com/apexskier/nova-typescript
function rangeToLspRange(document, range) {
  const fullContents = document.getTextInRange(new Range(0, document.length))
  let chars = 0
  let startLspRange
  const lines = fullContents.split(document.eol)
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineLength = lines[lineIndex].length + document.eol.length
    if (!startLspRange && chars + lineLength >= range.start) {
      const character = range.start - chars
      startLspRange = { line: lineIndex, character }
    }
    if (startLspRange && chars + lineLength >= range.end) {
      const character = range.end - chars
      return { start: startLspRange, end: { line: lineIndex, character } }
    }
    chars += lineLength
  }
  return null
}

// Turn an LSP row-column range to a Nova start-end range.
// From https://github.com/apexskier/nova-typescript
function lspRangeToRange(document, range) {
  const fullContents = document.getTextInRange(new Range(0, document.length))
  let rangeStart = 0
  let rangeEnd = 0
  let chars = 0
  const lines = fullContents.split(document.eol)
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineLength = lines[lineIndex].length + document.eol.length
    if (range.start.line === lineIndex) {
      rangeStart = chars + range.start.character
    }
    if (range.end.line === lineIndex) {
      rangeEnd = chars + range.end.character
      break
    }
    chars += lineLength
  }
  return new Range(rangeStart, rangeEnd)
}

console.info("main.js is being run");
try {
  console.info("Path:", nova.extension.path);
} catch (err) {
  console.error("Couldn't get path, error was:", err.message);
}

try {
  var serverOptions = {
    path: "/usr/bin/env",
    type: "stdio",
    args: ["gopls", "serve", "-logfile", "/tmp/gopls.log"],
    // args: ["gopls", "-vv", "-rpc.trace", "serve", "-logfile", "/tmp/gopls.log"],
  };
} catch (err) {
  console.error("could not set path on serverOptions, error was:", err.message);
}

var clientOptions = {
  syntaxes: ["go"],
};
var client = new LanguageClient(
  "Go",
  "gopls", // instructions say: The name parameter is the name of the server that can potentially be shown to the user
  serverOptions,
  clientOptions
);

try {
  client.start();
} catch (err) {
  console.error("Couldn't start server, error was:", err.message);
} finally {
  console.info("Server was started");
}

// post checking:

try {
  if (client.running) {
    console.info("gopls seems to be running");
    console.info(
      "Instance name:",
      client.name,
      "Language identifier:",
      client.identifier
    );
  }
} catch (err) {
  console.error(
    "No clue about why the client cannot communicate with gopls; error was: ",
    err.message
  );
}

// Cleaning up the log file
exports.deactivate = function () {
  try {
    // nova.fs.remove("/tmp/gopls.log");
  } catch (err) {
    console.error("Attempt to remove the gopls log resulted in an error:", err);
  } finally {
    console.info("Logs cleaned; uninstall finished.");
  }
};

nova.commands.register("go.lspFormat", (editor) => {
  console.info("Editor document", editor.document);

  client
    .sendRequest("textDocument/formatting", {
      textDocument: {
        uri: editor.document.uri,
      },
      options: {
        tabSize: 8,
        insertSpaces: false,
      },
    })
    .then(function (result) {
      console.info("Formatting result:", result);
    })
    .catch(function (failed) {
      console.info("Failed result:", failed);
    });
});

nova.commands.register("go.jumpToDefinition", (editor) => {
  var selectedRange = editor.selectedRange;
  selectedPosition =
    (_a = rangeToLspRange(editor.document, selectedRange)) === null ||
    _a === void 0
      ? void 0
      : _a.start;
  if (!selectedPosition) {
    nova.workspace.showWarningMessage(
      "Couldn't figure out what you've selected."
    );
    return; // [2 /*return*/];
  }
  var params = {
    textDocument: {
      uri: editor.document.uri,
    },
    position: selectedPosition,
  };
  var jump = client.sendRequest("textDocument/definition", params);
  // {"uri":"file:///opt/brew/Cellar/go@1.14/1.14.7/libexec/src/fmt/print.go","range":{"start":{"line":272,"character":5},"end":{"line":272,"character":12}}}

  jump
    .then(function (to) {
      if (to !== null) {
        if (to.length > 0) {
          var target = to[0];
          console.info("Jumping", JSON.stringify(to[0]));
          nova.workspace.openFile(target.uri).then(function (targetEditor) {
            // When Nova first opens a file, the callback gets an undefined editor,
            // which is most likely a bug. Usually works the second time.
            if (targetEditor === undefined) {
              console.error("Failed to get TextEditor, will retry");
              nova.workspace.openFile(target.uri).then(function (targetEditor) {
                setEditorToLspRange(targetEditor, target.range);
              }).catch(function(err) {
                console.error("Failed to get text editor on the second try", err);
              });
            } else {
              setEditorToLspRange(targetEditor, target.range);
            }
          }).catch(function(err) { console.info("Failed in the jump", err); });
        }
      }
    })
    .catch(function () {
      console.log("FAIL");
    });
});


function setEditorToLspRange(targetEditor, lspRange) {
  console.info("lspRange:", JSON.stringify(lspRange));
  var novaRange = lspRangeToRange(targetEditor.document, lspRange);
  console.info("Setting editor to range", novaRange.start, novaRange.end);
  targetEditor.selectedRange = novaRange;
  targetEditor.scrollToCursorPosition();
}

function lspRangeToRange(document, lspRange) {
  var fullContents = document.getTextInRange(new Range(0, document.length));
  var chars = 0;
  var rangeStart = 0;
  var rangeEnd = 0;
  var lines = fullContents.split(document.eol);
  for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    if (lineIndex == lspRange.start.line) {
      rangeStart = chars + lspRange.start.character;
    }
    if (lineIndex == lspRange.end.line) {
      rangeEnd = chars + lspRange.end.character;
      break;
    }
    chars = chars + lines[lineIndex].length + document.eol.length;
  }
  return new Range(rangeStart, rangeEnd);
}

// Borrowed from https://github.com/apexskier/nova-typescript
function rangeToLspRange(document, range) {
  var fullContents = document.getTextInRange(new Range(0, document.length));
  var chars = 0;
  var startLspRange;
  var lines = fullContents.split(document.eol);
  for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    var lineLength = lines[lineIndex].length + document.eol.length;
    if (!startLspRange && chars + lineLength >= range.start) {
      var character = range.start - chars;
      startLspRange = { line: lineIndex, character: character };
    }
    if (startLspRange && chars + lineLength >= range.end) {
      var character = range.end - chars;
      return {
        start: startLspRange,
        end: { line: lineIndex, character: character },
      };
    }
    chars += lineLength;
  }
  return null;
}


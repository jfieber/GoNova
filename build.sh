#!/usr/bin/env bash

fail() {
	echo "error: $*"
	exit 1
}

# Assemble the script code
npx rollup -c rollup.config.main.js || fail "Script compile failed"

# Update the gopls option configuration
node configgen.js | tee GoNova.novaextension/config.json || fail "gopls option configuration failed"

# Build the tree-sitter syntax
git submodule update --init || fail "submodule update failure"
cd src/Syntaxes/tree-sitter-go
cp ../Makefile .
nova=$(mdfind kMDItemCFBundleIdentifier = com.panic.Nova)
test -d "$nova" || fail "Could not locate Nova.app"
../compile_parser.sh "$PWD" $nova || fail "Parser compile failed"
mv libtree-sitter-go*.dylib ../../../GoNova.novaextension/Syntaxes/


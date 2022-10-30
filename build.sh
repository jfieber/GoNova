#!/usr/bin/env bash

./genopts | tee GoNova.novaextension/gopls.json

git submodule update --init

cd src/tree-sitter-go || exit 1
cp ../Makefile .

npx tree-sitter generate || exit 3

nova=$(mdfind kMDItemCFBundleIdentifier = com.panic.Nova)
test -d "$nova" || exit 4

../compile_parser.sh "$PWD" $nova || exit 5

mv libtree-sitter-go*.dylib ../../GoNova.novaextension/Syntaxes/

exit 0

#!/usr/bin/env node

//
// A node.js script to assemble Nova extension preferences file gopls.json.
// It uses the gopls api-json output, which is the gopls command that describes
// all its configuration options.
//

import * as child_process from 'child_process';

const goplsPrefKey = 'org.ursamaris.nova.go.gopls';

// Base preferences are those unique to this Nova extension, plus a placeholder for
// the gopls options to be injected after processing.
var novaPreferences = [
    {
        key: 'gonova',
        title: 'Go Nova',
        type: 'section',
        children: [
            {
                key: 'org.ursamaris.nova.go.go-path',
                title: 'Go Command',
                description:
                    'The path to the go command. Use an absolute path here if go is not in your search path.',
                type: 'path',
                default: 'go',
                filetype: ['public.unix-executable'],
            },
            {
                key: 'org.ursamaris.nova.go.gopls-path',
                title: 'Language Server Command',
                link: 'https://github.com/golang/tools/blob/master/gopls/README.md',
                description:
                    'The path to the gopls command. Use an absolute path here if gopls is not in your search path.',
                type: 'path',
                default: 'gopls',
                filetype: ['public.unix-executable'],
            },
            {
                key: 'org.ursamaris.nova.go.fmtsave',
                title: 'Format on save',
                type: 'boolean',
                default: false,
            },
            {
                key: 'org.ursamaris.nova.go.impsave',
                title: 'Organize imports on save',
                type: 'boolean',
                default: false,
            },
        ],
    },
    {
        key: goplsPrefKey,
        title: 'Go Language Server',
        description: 'Options which apply to the gopls language server.',
        link: 'https://github.com/golang/tools/blob/master/gopls/doc/settings.md',
        type: 'section',
        children: [],
    },
];

// The main show: walk through the gopls preferences, convert them
// to Nova preferences, then add them to the appropriate section
// of of the Nova preferences structure.
let gopls = child_process.spawnSync('gopls', ['api-json'], {
    encoding: 'utf8',
});
JSON.parse(gopls.stdout).Options.User.forEach((opt) => {
    var novaOpt = goplsToNovaPref(opt);
    if (novaOpt !== null) {
        var s = findSection(opt, novaPreferences);
        s.push(novaOpt);
    }
});
console.log(JSON.stringify(novaPreferences, null, 2));

// Locate a Nova preferences section based on the dotted option hierarchy
// of the preference to insert. The start argument is the top of
// the Nova structure structure.
function findSection(goplsPref, start) {
    var r = start;
    var path = [goplsPrefKey].concat(goplsPref.Hierarchy.split('.'));
    path.forEach((ps) => {
        var key = `${goplsPrefKey}.${ps}`;
        var key = ps;
        var section = r.find((i) => {
            return i.type === 'section' && i.key === key;
        });
        if (section === undefined) {
            section = {
                key: key,
                title: ps,
                type: 'section',
                children: [],
            };
            r.push(section);
        }
        r = section.children;
    });
    return r;
}

// Convert a gopls preference item to a Nova preference item. This will return null
// for options we don't know how to convert, or don't want to convert.
// For now, it just handles options with a "supported" status,
// currently indicated by an empty string for Status, or "advanced".
function goplsToNovaPref(goplsPref) {
    if (goplsPref.Status === '' || goplsPref.Status === 'advanced') {
        var novaPref = {
            key: `gopls.${goplsPref.Name}`,
            title: goplsPref.Name,
            description: goplsPref.Doc,
        };

        switch (goplsPref.Type) {
            case 'bool':
                novaPref.type = 'boolean';
                novaPref.default = goplsPref.Default == 'true';
                break;
            case '[]string':
                novaPref.type = 'stringArray';
                novaPref.default = [];
                break;
            case 'string':
                novaPref.type = 'string';
                novaPref.default = strfix(goplsPref.Default);
                break;
            case 'enum':
                novaPref.type = 'enum';
                novaPref.values = goplsPref.EnumValues.map((ev) => {
                    return strfix(ev.Value);
                });
                novaPref.default = strfix(goplsPref.Default);
                break;
            default:
                return null;
        }

        return novaPref;
    }
    return null;
}

// Tidy up some junk in the gopls output.
function strfix(goplsString) {
    return goplsString.replace(/^\"/, '').replace(/\"$/, '');
}

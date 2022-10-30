// Routines for working with gopls.
const ext = require('ext.js');

// Obtain the gopls path and version.
async function Version() {
    const ver = {
        path: ToolPath(nova.config.get(ext.ns('gopls-path'), 'string')),
        version: null,
    };
    if (ver.path !== undefined) {
        const out = await ext.exec(ver.path, { args: ['version'] });
        if (out.status !== 0) {
            console.error(`gopls return exit code ${exitCode}`);
        } else {
            ver.version = out.stdout[0].match(/v\d+\.\d+.\d+/);
        }
    }
    return ver;
}

// Install a version of gopls
async function Install(version) {
    console.log(`installing gopls version ${version}`);
    await Go({
        args: ['install', `golang.org/x/tools/gopls@${version}`],
        cwd: '/tmp',
        env: {
            GO111MODULE: 'on',
        },
    });
    return Version();
}

// Invoke go env VARNAME
async function GoEnv(name) {
    const result = await Go({
        args: ['env', name],
    });
    const val = result.stdout.join('\n'.trim());
    return val === '' ? undefined : val;
}

// Return the full path an external tool, or undefined if the
// path isn't found, or isn't executable.
function ToolPath(tool) {
    // First, just check the passed in argument.
    if (nova.fs.access(tool, nova.fs.R_OK, nova.fs.X_OK)) {
        return tool;
    }

    // No? Okay, then look in GOPATH, and then PATH
    var search = [];
    if (nova.environment['GOPATH']) {
        search.push(nova.path.join(nova.environment['GOPATH'], 'bin'));
    }
    search = search.concat(nova.environment['PATH'].split(':'));
    var found = search.find((val) => {
        return nova.fs.access(
            nova.path.join(val, tool),
            nova.fs.R_OK,
            nova.fs.X_OK
        );
    });
    if (found) {
        return nova.path.join(found, tool);
    }
    return undefined;
}

// Obtain the go version.
async function GoVersion() {
    const result = await Go({
        args: ['version'],
    });
    let val = result.stdout.join('\n'.trim());
    if (val === '') {
        val = undefined;
    } else {
        val = val.match(/go\d+\.\d+.\d+/);
    }
    return val;
}

function Go(options) {
    return ext.exec(ToolPath('go'), options);
}

// Publish
exports.GoEnv = GoEnv;
exports.GoVersion = GoVersion;
exports.Install = Install;
exports.ToolPath = ToolPath;
exports.Version = Version;

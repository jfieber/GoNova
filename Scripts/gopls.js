// Routines for working with gopls.

function enabled() {
    return nova.config.get(exItem('gopls-enabled'), 'boolean');
}

function enable() {
    return nova.config.set(exItem('gopls-enabled'), true);
}

function disable() {
    return nova.config.set(exItem('gopls-enabled'), false);
}

// Preferences for gopls
const goplsConfPath = require('../gopls.json');
const goplsConfPrefix = 'gopls.';

// Return an array of configuration property names that should be
// passed to the gopls initialization.
function goplsSettings() {
    let conf = {};
    ['gopls-supported', 'gopls-experimental'].forEach((section) => {
        var cs = goplsConfPath.find((i) => i.key === section);
        if (Array.isArray(cs.children)) {
            return cs.children.forEach((ci) => {
                if (ci.key.indexOf(goplsConfPrefix) === 0) {
                    conf[ci.key.replace(goplsConfPrefix, '')] = nova.config.get(
                        ci.key
                    );
                }
            });
        }
    });
    return conf;
}

// Obtain the gopls version.
function goplsVersion() {
    return new Promise((resolve, reject) => {
        let gpath = toolPath(nova.config.get(exItem('gopls-path'), 'string'));
        if (gpath === undefined) {
            return reject('could not locate the gopls command');
        }
        let goplsvers = new Process(gpath, { args: ['version'] });
        let foundVersion = null;
        goplsvers.onStdout((line) => {
            if (foundVersion === null) {
                foundVersion = line.match(/v\d+\.\d+.\d+/);
            }
        });
        goplsvers.onDidExit((exitCode) => {
            if (exitCode !== 0) {
                reject(`gopls return exit code ${exitCode}`);
            } else {
                if (foundVersion == null) {
                    reject('unable to determine gopls version');
                } else {
                    resolve({ version: foundVersion, path: gpath });
                }
            }
        });
        goplsvers.start();
    });
}

// Install a version of gopls
function installGopls(version) {
    return new Promise((resolve, reject) => {
        console.log(`installing gopls ${version}`);
        let gpath = toolPath('go');
        if (gpath === undefined) {
            return reject('could not find go');
        }

        goGet = new Process(gpath, {
            args: ['get', `golang.org/x/tools/gopls@${version}`],
            cwd: '/tmp',
            env: {
                GO111MODULE: 'on',
            },
        });

        let stdout = '';
        goGet.onStdout((line) => {
            stdout += line;
        });

        let stderr = '';
        goGet.onStderr((line) => {
            stderr += line;
        });

        goGet.onDidExit((status) => {
            if (status === 0) {
                goplsVersion().then(resolve).catch(reject);
            } else {
                reject({
                    status: status,
                    stdout: stdout,
                    stderr: stderr,
                });
            }
        });

        goGet.start();
    });
}

// Invoke go env VARNAME
function goEnv(name) {
    return new Promise((resolve, reject) => {
        var options = {
            args: ['go', 'env', name],
        };
        var process = new Process('/usr/bin/env', options);
        lines = new Array();
        process.onStdout((line) => {
            lines.push(line);
        });
        process.onDidExit((exitCode) => {
            if (exitCode !== 0) {
                reject(`${options.args.join(' ')} exited ${exitCode}`);
            }
            resolve(lines.join('\n').trim());
        });
        process.start();
    });
}

// Return the full path an external tool, or undefined if the
// path isn't found, or isn't executable.
function toolPath(tool) {
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

function exItem(name) {
    return [nova.extension.identifier, name].join('.');
}

// Publish
exports.ToolPath = toolPath;
exports.Install = installGopls;
exports.Version = goplsVersion;
exports.Env = goEnv;
exports.Enabled = enabled;
exports.Enable = enable;
exports.Disabled = disable;
exports.Settings = goplsSettings;

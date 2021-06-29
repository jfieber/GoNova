// Grab-bag of extension utilities

// Append an extension config/command name to the extension prefix
function ns(name) {
    return [nova.extension.identifier, name].join('.');
}

// Promise Logger
function plog(prefix) {
    return (msg) => {
        console.info(`${prefix}: ${msg}`);
    };
}

//
// Execute a command, with options as per the Nova Process API
// and return an promise resolving/rejecting to an object:
//
// {
//   status: number,
//   stdout: string[],
//   stderr: string[]
// }
//
function exec(command, options) {
    return new Promise((resolve, reject) => {
        const retVal = {
            status: 0,
            stdout: [],
            stderr: [],
        };
        const cmd = new Process(command, options || {});
        cmd.onStdout((l) => {
            retVal.stdout.push(l.trim());
        });
        cmd.onStderr((l) => {
            retVal.stderr.push(l.trim());
        });
        cmd.onDidExit((status) => {
            retVal.status = status;
            if (status === 0) {
                resolve(retVal);
            } else {
                reject(retVal);
            }
        });
        try {
            cmd.start();
        } catch (e) {
            retVal.status = 128;
            retVal.stderr = [e.message];
            reject(retVal);
        }
    });
}

// Publish
exports.ns = ns;
exports.plog = plog;
exports.exec = exec;

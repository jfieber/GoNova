// Routines for working with gopls.
// const ext = require('ext.js');
import * as ext from "./ext";

type goplsVersion = {
    path: string | null
    version: string | null
}


// Obtain the gopls path and version.
export async function Version(): Promise<goplsVersion> {
    const ver: goplsVersion = {
        path: nova.config.get(ext.ns('gopls-path'), 'string'),
        version: null,
    };
    if (ver.path !== null) {
        ver.path = ToolPath(ver.path)
    }
    if (ver.path !== null) {
        const out = await ext.exec(ver.path, { args: ['version'] });
        if (out.status !== 0) {
            console.error(`gopls return exit code ${out.status}`);
        } else {
            const x = out.stdout[0].match(/v\d+\.\d+.\d+/)
            if (null != x) {
                ver.version = x[0];
            }
        }
    }
    return ver;
}

// Install a version of gopls
export async function Install(version: string) {
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
export async function GoEnv(name: string): Promise<string | undefined> {
    const result = await Go({
        args: ['env', name],
    });
    const val = result.stdout.join('\n'.trim());
    return val === '' ? undefined : val;
}

// Return the full path an external tool, or undefined if the
// path isn't found, or isn't executable.
export function ToolPath(tool: string): string | null {
    // First, just check the passed in argument.
    if (nova.fs.access(tool, nova.fs.R_OK | nova.fs.X_OK)) {
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
            nova.fs.R_OK | nova.fs.X_OK
        );
    });
    if (found) {
        return nova.path.join(found, tool);
    }
    return null;
}

// Obtain the go version.
export async function GoVersion(): Promise<string | null> {
    const result = await Go({
        args: ['version']
    });
    let val = result.stdout.join('\n'.trim());
    if (val === '') {
        return null;
    } else {
        const m = val.match(/go\d+\.\d+.\d+/)
        if (!m) {
            return null;
        }
        return m[0];
    }
}

export function Go(options: ext.ExecOptions): Promise<ext.ExecStatus> {
    const goPath = ToolPath('go');
    if (null === goPath) {
        throw "could not locate go"
    }
    return ext.exec(goPath, options);
}

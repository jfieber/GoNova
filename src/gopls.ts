// Routines for working with gopls.
// const ext = require('ext.js');
import * as ext from './ext';
import * as config from './config';

type toolVersion = {
    path: string | null;
    version: string | null;
};

// Obtain the go path and version.
export async function GoVersion(): Promise<toolVersion> {
    const ver: toolVersion = {
        path: ToolPath(config.getString(config.keys.GoPath) ?? 'go'),
        version: null,
    };
    const result = await Go({ args: ['version'] });
    if (result.status !== 0) {
        console.error(`go returned an exit code of ${result.status}`);
    } else {
        const m = result.stdout[0].match(/go(\d+\.\d+.\d+)/);
        if (m) {
            ver.version = m[1];
        }
    }
    return ver;
}

// Invoke Go
export function Go(options: ext.ExecOptions): Promise<ext.ExecStatus> {
    const goPath = ToolPath(config.getString(config.keys.GoPath) ?? 'go');
    if (null === goPath) {
        throw 'could not locate go';
    }
    return ext.exec(goPath, options);
}

// Invoke go env VARNAME
export async function GoEnv(name: string): Promise<string | undefined> {
    const result = await Go({
        args: ['env', name],
    });
    const val = result.stdout.join('\n'.trim());
    return val === '' ? undefined : val;
}

// Obtain the gopls path and version.
export async function GoplsVersion(): Promise<toolVersion> {
    const ver: toolVersion = {
        path: ToolPath(config.getString(config.keys.GoplsPath) ?? 'gopls'),
        version: null,
    };
    if (ver.path !== null) {
        const out = await ext.exec(ver.path, { args: ['version'] });
        if (out.status !== 0) {
            console.error(`gopls return exit code ${out.status}`);
        } else {
            const x = out.stdout[0].match(/v(\d+\.\d+.\d+)/);
            if (null != x) {
                ver.version = x[1];
            }
        }
    }
    return ver;
}

// Install a version of gopls
export async function GoplsInstall(version: string) {
    console.log(`installing gopls version ${version}`);
    await Go({
        args: ['install', `golang.org/x/tools/gopls@${version}`],
        cwd: '/tmp',
        env: {
            GO111MODULE: 'on',
        },
    });
    return GoplsVersion();
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

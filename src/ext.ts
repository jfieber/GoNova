// Grab-bag of extension utilities

// Append an extension config/command name to the extension prefix
export function ns(name: string): string {
    return [nova.extension.identifier, name].join('.');
}

// Promise Logger
export function plog(prefix: string) {
    return (msg: string) => {
        console.info(`${prefix}: ${msg}`);
    };
}

export type ExecStatus = {
    status: number;
    stdout: string[];
    stderr: string[];
}

export type ExecOptions = {
    args?: string[];
    env?: { [key: string]: string };
    cwd?: string;
    stdio?: ['pipe' | 'ignore', 'pipe' | 'ignore', 'pipe' | 'ignore'] | 'pipe' | 'ignore' | 'jsonrpc' | number;
    shell?: true | string;
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
export function exec(command: string, options: ExecOptions): Promise<ExecStatus> {
    return new Promise((resolve, reject) => {
        const retVal: ExecStatus = {
            status: 0,
            stdout: [],
            stderr: [],
        };
        const cmd = new Process(command, options || {});
        cmd.onStdout((l: string) => {
            retVal.stdout.push(l.trim());
        });
        cmd.onStderr((l: string) => {
            retVal.stderr.push(l.trim());
        });
        cmd.onDidExit((status: number) => {
            retVal.status = status;
            if (status === 0) {
                resolve(retVal);
            } else {
                reject(retVal);
            }
        });
        try {
            cmd.start();
        } catch (e: any) {
            retVal.status = 128;
            retVal.stderr = [e.message];
            reject(retVal);
        }
    });
}

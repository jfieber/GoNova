// Append an extension config/command name to the extension prefix.
export function ns(name: string): string {
    return [nova.extension.identifier, name].join('.');
}

// Retrieve a config value from the workspace, falling back to the global config if not set.
export function get(name: string): ConfigurationValue | null {
    return nova.workspace.config.get(name) ?? nova.config.get(name);
}

// Retrieve a config value as a string from the workspace, falling back to the global config if not set.
export function getString(name: string): string | null {
    return (
        nova.workspace.config.get(name, 'string') ??
        nova.config.get(name, 'string')
    );
}

// Watch for the effective value of a config item to change. This watches for updates
// to both the global and workspace config for a given name.
export function watch(
    name: string,
    action: (name: String, value: string | null) => any
) {
    let watchVal = getString(name);
    const watchFunc = function (_current: any, _old: any) {
        const newVal = getString(name);
        if (watchVal !== newVal) {
            watchVal = newVal;
            action(name, newVal);
        }
    };
    nova.config.onDidChange(name, watchFunc);
    nova.workspace.config.onDidChange(name, watchFunc);
}

// Config item keys
export const keys = {
    GoPath: ns('go-path'),
    GoplsPath: ns('gopls-path'),
    FmtSave: ns('fmtsave'),
    ImpSave: ns('impsave'),
};

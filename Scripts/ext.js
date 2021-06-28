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

// Publish
exports.ns = ns;
exports.plog = plog;

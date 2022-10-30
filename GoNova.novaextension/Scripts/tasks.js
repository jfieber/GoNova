const gopls = require('gopls.js');

function CreateTasks() {
    let go = gopls.ToolPath('go');
    if (!go) {
        console.warn("Couldn't find go executable");
        return;
    }

    let tasks = [];
    let modTidy = new Task('Mod Tidy');
    modTidy.setAction(
        Task.Build,
        new TaskProcessAction(go, {
            args: ['mod', 'tidy'],
            env: {},
        })
    );
    tasks.push(modTidy);

    let modVendor = new Task('Mod Vendor');
    modVendor.setAction(
        Task.Build,
        new TaskProcessAction(go, {
            args: ['mod', 'vendor'],
            env: {},
        })
    );
    tasks.push(modVendor);

    nova.assistants.registerTaskAssistant({
        provideTasks: function () {
            return [modTidy, modVendor];
        },
    });
}

exports.CreateTasks = CreateTasks;

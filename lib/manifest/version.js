'use strict';

class Version {
    constructor(manifest, name) {
        this._manifest = manifest;
        this._name = name;
        this._tasks = [];
    }

    get manifest() {
        return this._manifest;
    }

    get name() {
        return this._name;
    }

    get tasks() {
        return this._tasks;
    }

    addTask(task) {
        this._tasks.push(task);
    }

    validateScriptsExist() {
        function collectErrors(arr, i = 0, errors = []) {
            if (i >= arr.length) {
                if (errors.length) {
                    const err = new Error('Unreadable files');
                    err.errors = errors;

                    return Promise.reject(err);
                }

                return;
            }

            const obj = arr[i];

            return obj.promise.then(
                () => collectErrors(arr, i + 1, errors),
                (err) => {
                    err.task = obj.task;

                    return collectErrors(arr, i + 1, errors.concat([err]));
                }
            );
        }

        const ps = this.tasks.map((task) => ({ task: task, promise: task.validateScriptExists() }));

        return collectErrors(ps);
    }
}

module.exports = Version;

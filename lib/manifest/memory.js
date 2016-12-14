'use strict';

class MemoryTask {
    constructor(name, script) {
        this._name = name;
        this._script = script;
    }

    get name() {
        return this._name;
    }

    loadScript() {
        return Promise.resolve(this._script);
    }
}

class MemoryVersion {
    constructor(name) {
        this._name = name;
        this._tasks = [];
    }

    get name() {
        return this._name;
    }

    get tasks() {
        return this._tasks;
    }

    addTask(name, script) {
        const result = new MemoryTask(name, script);
        this._tasks.push(result);

        return result;
    }
}

class MemoryManifest {
    constructor(product) {
        this._product = product;
        this._versions = [];
    }

    get product() {
        return this._product;
    }

    get versions() {
        return this._versions;
    }

    addVersion(version) {
        const result = new MemoryVersion(version);
        this._versions.push(result);

        return result;
    }
}

module.exports = MemoryManifest;

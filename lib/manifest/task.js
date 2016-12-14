'use strict';

const fs = require('fs');
const path = require('path');

class Task {
    constructor(version, name, path) {
        this._version = version;
        this._name = name;
        this._path = path;
    }

    get version() {
        return this._version;
    }

    get manifest() {
        return this.version.manifest;
    }

    get name() {
        return this._name;
    }

    get path() {
        return this._path;
    }

    get fullPath() {
        return path.resolve(path.dirname(this.manifest.source), this.path);
    }

    loadScript() {
        return new Promise((resolve, reject) => {
            fs.readFile(this.fullPath, { encoding: 'utf8' }, (err, content) => {
                if (err) { reject(err); }

                return resolve(content);
            });
        });
    }

    validateScriptExists() {
        return new Promise((resolve, reject) => {
            fs.access(this.fullPath, fs.constants.R_OK, (err) => {
                if (err) { return reject(err); }

                return resolve();
            });
        });
    }
}

module.exports = Task;

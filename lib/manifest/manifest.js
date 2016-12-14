'use strict';

class Manifest {
    constructor(source, product) {
        this._source = source;
        this._product = product;
        this._versions = [];
    }

    get product() {
        return this._product;
    }

    get source() {
        return this._source;
    }

    get versions() {
        return this._versions;
    }

    addVersion(version) {
        this._versions.push(version);
    }

    validateScriptsExist() {
        function collectErrors(promises, i = 0, errors = []) {
            // console.log('manifest.collectErrors', 'promises', i, errors);
            if (i >= promises.length) {
                if (errors.length) {
                    const err = new Error('Unreadable files');
                    err.errors = errors;

                    return Promise.reject(err);
                }

                return;
            }

            const promise = promises[i];

            return promise.then(
                () => collectErrors(promises, i + 1, errors),
                (err) => collectErrors(promises, i + 1, errors.concat(err.errors))
            );
        }

        const ps = this.versions.map((version) => version.validateScriptsExist());

        return collectErrors(ps);
    }
}

module.exports = Manifest;

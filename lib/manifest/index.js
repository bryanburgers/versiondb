'use strict';

const Manifest = require('./manifest');
const Version = require('./version');
const Task = require('./task');
const MemoryManifest = require('./memory');

const fs = require('fs');
const Joi = require('joi');
const yaml = require('js-yaml');

const manifestSchema = Joi.object().keys({
    product: Joi.string().required(),
    versions: Joi.object().pattern(
        /./,
        Joi.array().items(
            Joi.object().keys({
                name: Joi.string().required(),
                script: Joi.string().required(),
            })
        )),
});

function readFile(filename) {
    return new Promise((resolve, reject) => {
        fs.readFile(filename, { encoding: 'utf8' }, (err, contents) => {
            if (err) { return reject(err); }

            return resolve(contents);
        });
    })
        .catch(() => {
            throw new Error(`The file ${filename} could not be opened`);
        });
}

function readFromFile(path) {
    return readFile(path)
        .then((contents) => yaml.safeLoad(contents))
        .then((obj) => {
            const result = Joi.validate(obj, manifestSchema, { abortEarly: false });
            if (result.error) {
                throw new Error('Invalid schema file', result.error);
            }

            const manifest = new Manifest(path, obj.product);

            for (const versionName of Object.keys(obj.versions)) {
                const version = new Version(manifest, versionName);
                manifest.addVersion(version);

                for (const taskObj of obj.versions[versionName]) {
                    const task = new Task(version, taskObj.name, taskObj.script);
                    version.addTask(task);
                }
            }

            return manifest;
        });
}

module.exports = {
    readFromFile,
    Manifest,
    Version,
    Task,
    MemoryManifest,
};

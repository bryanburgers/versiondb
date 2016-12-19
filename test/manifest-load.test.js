/* global describe, it */

'use strict';

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const manifest = require('../lib/manifest');
const path = require('path');

chai.use(chaiAsPromised);
const assert = chai.assert;

describe('manifest', function() {
    describe('#readFromFile', function() {
        const source = path.resolve(__dirname, './manifests/test-1/manifest.yaml');

        it('reads a manifest from a file', function() {
            return manifest.readFromFile(source)
                .then((result) => {
                    assert.instanceOf(result, manifest.Manifest);
                });
        });

        it('returns the correct product name', function() {
            return manifest.readFromFile(source)
                .then((result) => {
                    assert.equal(result.product, 'test-1');
                });
        });

        it('returns the correct source', function() {
            return manifest.readFromFile(source)
                .then((result) => {
                    assert.equal(result.source, source);
                });
        });

        it('returns the correct versions', function() {
            return manifest.readFromFile(source)
                .then((result) => {
                    assert.isArray(result.versions);
                    assert.lengthOf(result.versions, 2);
                    assert.equal(result.versions[0].name, '19850421', 'First version');
                    assert.equal(result.versions[1].name, '20120106', 'Second version');
                });
        });

        it('returns the correct tasks', function() {
            return manifest.readFromFile(source)
                .then((result) => {
                    const version = result.versions[0];

                    assert.isArray(version.tasks);
                    assert.lengthOf(version.tasks, 2);
                    assert.equal(version.tasks[0].name, 'Number 1');
                    assert.equal(version.tasks[1].name, 'Number 2');
                });
        });

        it('returns the correct task data', function() {
            return manifest.readFromFile(source)
                .then((result) => {
                    const task = result.versions[0].tasks[0];

                    assert.instanceOf(task, manifest.Task);
                    assert.equal(task.name, 'Number 1', 'name');
                    assert.equal(task.path, '19850421/number-1.sql', 'path');
                    assert.equal(task.fullPath, path.resolve(__dirname, './manifests/test-1/19850421/number-1.sql'), 'full path');
                });
        });

        it('can load the script for a task', function() {
            return manifest.readFromFile(source)
                .then((result) => {
                    const task = result.versions[0].tasks[0];

                    return task.loadScript();
                })
                .then((script) => {
                    assert.isString(script);
                    assert.equal(script.trim(), 'CREATE TABLE number1 ();');
                });
        });

        it('rejects when the script for a task cannot be loaded', function() {
            const result = manifest.readFromFile(path.resolve(__dirname, './manifests/test-1/missing-files.yaml'))
                .then((result) => {
                    const task = result.versions[0].tasks[1];

                    return task.loadScript();
                });

            return assert.isRejected(result);
        });

        it('rejects when the file can not be found', function() {
            const result = manifest.readFromFile(path.resolve(__dirname, './manifests/test-1/this-file-does-not-exist.yaml'));

            return assert.isRejected(result, /File.*not.*open/i);
        });

        it('rejects when the document is not YAML', function() {
            const result = manifest.readFromFile(path.resolve(__dirname, './manifests/test-1/not-even-yaml.md'));

            return assert.isRejected(result, /Invalid/i);
        });

        it('rejects when the document is YAML but is not a versiondb document', function() {
            const result = manifest.readFromFile(path.resolve(__dirname, './manifests/test-1/invalid-structure.yaml'));

            return assert.isRejected(result, /Invalid/i);
        });

        it('returns the order specified in the YAML file', function() {
            const result = manifest.readFromFile(path.resolve(__dirname, './manifests/test-1/nonstandard-order.yaml'));

            return assert.isFulfilled(result)
                .then((result) => {
                    assert.isArray(result.versions);
                    assert.lengthOf(result.versions, 2);
                    assert.equal(result.versions[0].name, 'baseline', 'First version');
                    assert.equal(result.versions[1].name, '20120106', 'Second version');
                });
        });
    });
});

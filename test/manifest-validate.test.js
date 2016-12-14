/* global describe, it */

'use strict';

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const manifest = require('../lib/manifest');
const path = require('path');

chai.use(chaiAsPromised);
const assert = chai.assert;

describe('manifest', function() {
    describe('validateScriptsExist', function() {
        it('returns successfully when all of the scripts exist', function() {
            const source = path.resolve(__dirname, './manifests/test-1/manifest.yaml');

            const result = manifest.readFromFile(source)
                .then((result) => result.validateScriptsExist());

            return assert.isFulfilled(result);
        });

        it('rejects when a script does not exist', function() {
            const source = path.resolve(__dirname, './manifests/test-1/missing-files.yaml');

            const result = manifest.readFromFile(source)
                .then((result) => result.validateScriptsExist());

            return assert.isRejected(result);
        });

        it('returns all of the tasks with bad locations', function() {
            const source = path.resolve(__dirname, './manifests/test-1/missing-files.yaml');

            const result = manifest.readFromFile(source)
                .then((result) => result.validateScriptsExist());

            return assert.isRejected(result)
                .then((err) => {
                    assert.isArray(err.errors);
                    assert.lengthOf(err.errors, 3);
                    assert.equal(err.errors[0].task.name, 'First missing file');
                    assert.equal(err.errors[1].task.name, 'Second missing file');
                    assert.equal(err.errors[2].task.name, 'Another missing file');
                });
        });
    });
});

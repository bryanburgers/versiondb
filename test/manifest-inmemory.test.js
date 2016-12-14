/* global describe, it, beforeEach */

'use strict';

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const manifest = require('../lib/manifest');

chai.use(chaiAsPromised);
const assert = chai.assert;

describe('manifest', function() {
    describe('MemoryManifest', function() {
        let subject = null;

        beforeEach(function() {
            subject = new manifest.MemoryManifest('test-1');
            const v1 = subject.addVersion('19850421');
            v1.addTask('Number 1', 'CREATE TABLE number1 ();');
            v1.addTask('Number 2', 'CREATE TABLE number2 ();');
            const v2 = subject.addVersion('20120106');
            v2.addTask('First thing', 'CREATE TABLE firstthing ();');
            v2.addTask('Second thing', 'CREATE TABLE secondthing ();');
        });

        it('returns the correct product name', function() {
            assert.equal(subject.product, 'test-1');
        });

        it('returns the correct versions', function() {
            assert.isArray(subject.versions);
            assert.lengthOf(subject.versions, 2);
            assert.equal(subject.versions[0].name, '19850421', 'First version');
            assert.equal(subject.versions[1].name, '20120106', 'Second version');
        });

        it('returns the correct tasks', function() {
            const version = subject.versions[0];

            assert.isArray(version.tasks);
            assert.lengthOf(version.tasks, 2);
            assert.equal(version.tasks[0].name, 'Number 1');
            assert.equal(version.tasks[1].name, 'Number 2');
        });

        it('can load the script for a task', function() {
            const task = subject.versions[0].tasks[0];

            return task.loadScript()
                .then((script) => {
                    assert.isString(script);
                    assert.equal(script.trim(), 'CREATE TABLE number1 ();');
                });
        });
    });
});

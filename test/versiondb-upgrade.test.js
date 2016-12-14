/* global describe, it, beforeEach, afterEach */
/* eslint "no-process-env":off */

'use strict';

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const EventEmitter = require('events').EventEmitter;
const MemoryManifest = require('../lib/manifest').MemoryManifest;
const pg = require('pg');
const versiondb = require('../lib/versiondb');

chai.use(chaiAsPromised);
const assert = chai.assert;

const db = process.env.DATABASE_URL;

describe('versiondb', function() {
    describe('upgrade', function() {
        let connection = null;

        beforeEach(function(done) {
            const client = new pg.Client(db);
            client.connect((err) => {
                if (err) { return done(err); }

                client.query('DROP SCHEMA IF EXISTS versiondb CASCADE')
                    .then(() => client.query('DROP SCHEMA IF EXISTS example CASCADE'))
                    .then(() => client.query('DROP SCHEMA IF EXISTS other CASCADE'))
                    .then(() => {
                        connection = client;
                        done();
                    })
                    .catch((err) => done(err));
            });
        });

        beforeEach(function() {
            return versiondb.initialize(connection);
        });

        afterEach(function(done) {
            if (connection) {
                connection.end(done);
                connection = null;
            }
            else {
                done();
            }
        });

        describe('upgrades successfully from nothing', function() {
            const manifest = new MemoryManifest('example');
            const v1 = manifest.addVersion('1.0.0');
            v1.addTask('Example', 'CREATE SCHEMA example');

            it('has the correct side effects', function() {
                return versiondb.upgrade(connection, manifest)
                    .then(() => connection.query('SELECT version FROM versiondb.version WHERE product = \'example\''))
                    .then((result) => {
                        assert.equal(result.rows[0].version, '1.0.0');
                    });
            });

            it('returns the correct result', function() {
                return versiondb.upgrade(connection, manifest)
                    .then((obj) => {
                        assert.propertyVal(obj, 'result', 'success', 'result');
                        assert.equal(obj.manifest, manifest, 'manifest');
                        assert.equal(obj.initialVersion, null, 'initialVersion');
                        assert.equal(obj.currentVersion, v1, 'currentVersion');
                        assert.deepEqual(obj.existingVersions, [], 'existingVersions');
                        assert.deepEqual(obj.updatedVersions, [v1], 'updatedVersions');
                        assert.deepEqual(obj.pendingVersions, [], 'pendingVersions');
                        assert.isNull(obj.failedVersion, 'failedVersion');
                        assert.isNull(obj.failedTask, 'failedTask');
                        assert.isNull(obj.failedTaskScript, 'failedTaskScript');
                        assert.isNull(obj.error, 'error');
                    });
            });

            it('emits the correct plan event', function() {
                const status = new EventEmitter();

                let plan = null;
                status.on('plan', (obj) => { plan = obj; });

                return versiondb.upgrade(connection, manifest, status)
                    .then(() => {
                        assert.isNotNull(plan);
                        assert.equal(plan.manifest, manifest, 'manifest');
                        assert.equal(plan.currentVersion, null, 'currentVersion');
                        assert.equal(plan.targetVersion, '1.0.0', 'targetVersion');
                        assert.deepEqual(plan.existingVersions, [], 'existingVersions');
                        assert.deepEqual(plan.versions, [v1], 'versions');
                    });
            });
        });

        describe('upgrades a pre-existing version', function() {
            const manifest = new MemoryManifest('example');
            const v1 = manifest.addVersion('1.0.0');
            v1.addTask('Example', 'CREATE SCHEMA example');
            const v2 = manifest.addVersion('1.0.1');
            v2.addTask('Other', 'CREATE SCHEMA other');

            beforeEach(function() {
                return connection.query('INSERT INTO versiondb.version VALUES (\'example\', \'1.0.0\')');
            });

            it('produces the expected side-effects', function() {
                return versiondb.upgrade(connection, manifest)
                    .then(() => connection.query('SELECT version FROM versiondb.version WHERE product = \'example\''))
                    .then((result) => {
                        assert.equal(result.rows[0].version, '1.0.1');
                    })
                    .then(() => connection.query('SELECT schema_name FROM information_schema.schemata WHERE schema_name = \'example\''))
                    .then((result) => {
                        // It should not have run the first query.
                        assert.equal(result.rowCount, 0);
                    })
                    .then(() => connection.query('SELECT schema_name FROM information_schema.schemata WHERE schema_name = \'other\''))
                    .then((result) => {
                        // It should have run the second query.
                        assert.equal(result.rowCount, 1);
                    });
            });

            it('returns the correct result', function() {
                return versiondb.upgrade(connection, manifest)
                    .then((obj) => {
                        assert.propertyVal(obj, 'result', 'success', 'result');
                        assert.equal(obj.manifest, manifest, 'manifest');
                        assert.equal(obj.initialVersion, '1.0.0', 'initialVersion');
                        assert.equal(obj.currentVersion, v2, 'currentVersion');
                        assert.deepEqual(obj.existingVersions, [v1], 'existingVersions');
                        assert.deepEqual(obj.updatedVersions, [v2], 'updatedVersions');
                        assert.deepEqual(obj.pendingVersions, [], 'pendingVersions');
                        assert.isNull(obj.failedVersion, 'failedVersion');
                        assert.isNull(obj.failedTask, 'failedTask');
                        assert.isNull(obj.failedTaskScript, 'failedTaskScript');
                        assert.isNull(obj.error, 'error');
                    });
            });

            it('emits the correct plan event', function() {
                const status = new EventEmitter();

                let plan = null;
                status.on('plan', (obj) => { plan = obj; });

                return versiondb.upgrade(connection, manifest, status)
                    .then(() => {
                        assert.isNotNull(plan);
                        assert.equal(plan.manifest, manifest, 'manifest');
                        assert.equal(plan.currentVersion, '1.0.0', 'currentVersion');
                        assert.equal(plan.targetVersion, '1.0.1', 'targetVersion');
                        assert.deepEqual(plan.existingVersions, [v1], 'existingVersions');
                        assert.deepEqual(plan.versions, [v2], 'versions');
                    });
            });
        });

        describe('gracefully fails on the first task of the first version', function() {
            const manifest = new MemoryManifest('example');
            const v1 = manifest.addVersion('1.0.0');
            const task = v1.addTask('Example', 'CREATE SCHEMA example;\nCREATE SCHEMA example');

            it('produces the expected side-effects', function() {
                return versiondb.upgrade(connection, manifest)
                    .then(() => connection.query('SELECT version FROM versiondb.version WHERE product = \'example\''))
                    .then((result) => {
                        assert.equal(result.rowCount, 0);
                    });
            });

            it('returns the correct result', function() {
                return versiondb.upgrade(connection, manifest)
                    .then((obj) => {
                        assert.propertyVal(obj, 'result', 'error', 'result');
                        assert.equal(obj.manifest, manifest, 'manifest');
                        assert.equal(obj.initialVersion, null, 'initialVersion');
                        assert.equal(obj.currentVersion, null, 'currentVersion');
                        assert.deepEqual(obj.existingVersions, [], 'existingVersions');
                        assert.deepEqual(obj.updatedVersions, [], 'updatedVersions');
                        assert.deepEqual(obj.pendingVersions, [v1], 'pendingVersions');
                        assert.equal(obj.failedVersion, v1, 'failedVersion');
                        assert.equal(obj.failedTask, task, 'failedTask');
                        assert.equal(obj.failedTaskScript, 'CREATE SCHEMA example;\nCREATE SCHEMA example', 'failedTaskScript');
                        assert.isNotNull(obj.error, 'error');
                    });
            });

            it('emits the correct plan event', function() {
                const status = new EventEmitter();

                let plan = null;
                status.on('plan', (obj) => { plan = obj; });

                return versiondb.upgrade(connection, manifest, status)
                    .then(() => {
                        assert.isNotNull(plan);
                        assert.equal(plan.manifest, manifest, 'manifest');
                        assert.equal(plan.currentVersion, null, 'currentVersion');
                        assert.equal(plan.targetVersion, '1.0.0', 'targetVersion');
                        assert.deepEqual(plan.existingVersions, [], 'existingVersions');
                        assert.deepEqual(plan.versions, [v1], 'versions');
                    });
            });
        });

        describe('gracefully fails on the second task of the first version', function() {
            const manifest = new MemoryManifest('example');
            const v1 = manifest.addVersion('1.0.0');
            v1.addTask('Example', 'CREATE SCHEMA example');
            const task2 = v1.addTask('Example again', 'CREATE SCHEMA example');

            it('produces the expected side-effects', function() {
                return versiondb.upgrade(connection, manifest)
                    .then(() => connection.query('SELECT version FROM versiondb.version WHERE product = \'example\''))
                    .then((result) => {
                        // The version was not recorded.
                        assert.equal(result.rowCount, 0);
                    })
                    .then(() => connection.query('SELECT schema_name FROM information_schema.schemata WHERE schema_name = \'example\''))
                    .then((result) => {
                        // We can't tell that the first task was run (done in a
                        // transaction).
                        assert.equal(result.rowCount, 0);
                    });
            });

            it('returns the correct result', function() {
                return versiondb.upgrade(connection, manifest)
                    .then((obj) => {
                        assert.propertyVal(obj, 'result', 'error', 'result');
                        assert.equal(obj.manifest, manifest, 'manifest');
                        assert.equal(obj.initialVersion, null, 'initialVersion');
                        assert.equal(obj.currentVersion, null, 'currentVersion');
                        assert.deepEqual(obj.existingVersions, [], 'existingVersions');
                        assert.deepEqual(obj.updatedVersions, [], 'updatedVersions');
                        assert.deepEqual(obj.pendingVersions, [v1], 'pendingVersions');
                        assert.equal(obj.failedVersion, v1, 'failedVersion');
                        assert.equal(obj.failedTask, task2, 'failedTask');
                        assert.equal(obj.failedTaskScript, 'CREATE SCHEMA example', 'failedTaskScript');
                        assert.isNotNull(obj.error, 'error');
                    });
            });
        });

        describe('gracefully fails on a later version', function() {
            const manifest = new MemoryManifest('example');
            const v1 = manifest.addVersion('1.0.0');
            v1.addTask('Example', 'CREATE SCHEMA example');
            const v2 = manifest.addVersion('1.0.1');
            const task = v2.addTask('Other', 'CREATE SCHEMA other;\nCREATE SCHEMA other');

            it('produces the expected side-effects', function() {
                return versiondb.upgrade(connection, manifest)
                    .then(() => connection.query('SELECT version FROM versiondb.version WHERE product = \'example\''))
                    .then((result) => {
                        // The first version should be recoreded in the versiondb
                        // table.
                        assert.equal(result.rowCount, 1, 'Expected row to exist in version table');
                        assert.equal(result.rows[0].version, '1.0.0', 'Expected version to match');
                    })
                    .then(() => connection.query('SELECT schema_name FROM information_schema.schemata WHERE schema_name = \'example\''))
                    .then((result) => {
                        // The first version should not have been rolled back.
                        assert.equal(result.rowCount, 1, 'Expected example schema to exist');
                    });
            });

            it('returns the correct result', function() {
                return versiondb.upgrade(connection, manifest)
                    .then((obj) => {
                        assert.propertyVal(obj, 'result', 'error', 'result');
                        assert.equal(obj.manifest, manifest, 'manifest');
                        assert.equal(obj.initialVersion, null, 'initialVersion');
                        assert.equal(obj.currentVersion, v1, 'currentVersion');
                        assert.deepEqual(obj.existingVersions, [], 'existingVersions');
                        assert.deepEqual(obj.updatedVersions, [v1], 'updatedVersions');
                        assert.deepEqual(obj.pendingVersions, [v2], 'pendingVersions');
                        assert.equal(obj.failedVersion, v2, 'failedVersion');
                        assert.equal(obj.failedTask, task, 'failedTask');
                        assert.equal(obj.failedTaskScript, 'CREATE SCHEMA other;\nCREATE SCHEMA other', 'failedTaskScript');
                        assert.isNotNull(obj.error, 'error');
                    });
            });
        });

        describe('stops running on an upgrade failure', function() {
            const manifest = new MemoryManifest('example');
            const v1 = manifest.addVersion('1.0.0');
            v1.addTask('Example', 'CREATE SCHEMA example');
            const v2 = manifest.addVersion('1.0.1');
            const task = v2.addTask('Other', 'CREATE SCHEMA other;\nCREATE SCHEMA other');
            const v3 = manifest.addVersion('1.0.2');
            v3.addTask('example.t', 'CREATE TABLE example.t (id integer PRIMARY KEY)');

            it('produces the expected side-effects', function() {
                return versiondb.upgrade(connection, manifest)
                    .then(() => connection.query('SELECT version FROM versiondb.version WHERE product = \'example\''))
                    .then((result) => {
                        // The third version should not have been run.
                        assert.equal(result.rowCount, 1, 'Expected row to exist in version table');
                        assert.equal(result.rows[0].version, '1.0.0', 'Expected version to match');
                    })
                    .then(() => connection.query('SELECT schema_name FROM information_schema.schemata WHERE schema_name = \'example\''))
                    .then((result) => {
                        assert.equal(result.rowCount, 1, 'Expected example schema to exist');
                    })
                    .then(() => connection.query('SELECT table_name FROM information_schema.tables WHERE table_schema = \'example\' AND table_name = \'t\''))
                    .then((result) => {
                        assert.equal(result.rowCount, 0, 'Expected example.t table to not exist');
                    });
            });

            it('returns the correct result', function() {
                return versiondb.upgrade(connection, manifest)
                    .then((obj) => {
                        assert.propertyVal(obj, 'result', 'error', 'result');
                        assert.equal(obj.manifest, manifest, 'manifest');
                        assert.equal(obj.initialVersion, null, 'initialVersion');
                        assert.equal(obj.currentVersion, v1, 'currentVersion');
                        assert.deepEqual(obj.existingVersions, [], 'existingVersions');
                        assert.deepEqual(obj.updatedVersions, [v1], 'updatedVersions');
                        assert.deepEqual(obj.pendingVersions, [v2, v3], 'pendingVersions');
                        assert.equal(obj.failedVersion, v2, 'failedVersion');
                        assert.equal(obj.failedTask, task, 'failedTask');
                        assert.equal(obj.failedTaskScript, 'CREATE SCHEMA other;\nCREATE SCHEMA other', 'failedTaskScript');
                        assert.isNotNull(obj.error, 'error');
                    });
            });
        });

        describe('does nothing when versions can not be reconciled', function() {
            const manifest = new MemoryManifest('example');
            manifest.addVersion('1.0.0').addTask('Example', 'CREATE SCHEMA example;\nCREATE SCHEMA example');

            beforeEach(function() {
                return connection.query('INSERT INTO versiondb.version VALUES (\'example\', \'0.7.0\')');
            });

            it('produces the expected side-effects', function() {
                return versiondb.upgrade(connection, manifest)
                    .then(() => connection.query('SELECT version FROM versiondb.version WHERE product = \'example\''))
                    .then((result) => {
                        assert.equal(result.rows[0].version, '0.7.0');
                    })
                    .then(() => connection.query('SELECT schema_name FROM information_schema.schemata WHERE schema_name = \'example\''))
                    .then((result) => {
                        assert.equal(result.rowCount, 0);
                    });
            });

            it('returns the correct result', function() {
                return versiondb.upgrade(connection, manifest)
                    .then((obj) => {
                        assert.propertyVal(obj, 'result', 'incompatible', 'result');
                        assert.equal(obj.manifest, manifest, 'manifest');
                        assert.equal(obj.initialVersion, '0.7.0', 'initialVersion');
                        assert.equal(obj.currentVersion, null, 'currentVersion');
                        assert.deepEqual(obj.existingVersions, [], 'existingVersions');
                        assert.deepEqual(obj.updatedVersions, [], 'updatedVersions');
                        assert.deepEqual(obj.pendingVersions, [], 'pendingVersions');
                        assert.isNull(obj.failedVersion, 'failedVersion');
                        assert.isNull(obj.failedTask, 'failedTask');
                        assert.isNull(obj.failedTaskScript, 'failedTaskScript');
                        assert.isNull(obj.error, 'error');
                    });
            });

            it('emits an incompatible event, not a plan', function() {
                const status = new EventEmitter();

                let plan = null;
                status.on('plan', (obj) => { plan = obj; });
                let incompatible = null;
                status.on('incompatible', (obj) => { incompatible = obj; });

                return versiondb.upgrade(connection, manifest, status)
                    .then(() => {
                        assert.isNull(plan);
                        assert.isNotNull(incompatible);
                        assert.equal(incompatible.manifest, manifest, 'manifest');
                        assert.equal(incompatible.currentVersion, '0.7.0', 'currentVersion');
                    });
            });
        });

        describe('does nothing when already up to date', function() {
            const manifest = new MemoryManifest('example');
            const v1 = manifest.addVersion('1.0.0');
            v1.addTask('Example', 'CREATE SCHEMA example;\nCREATE SCHEMA example');

            beforeEach(function() {
                return connection.query('INSERT INTO versiondb.version VALUES (\'example\', \'1.0.0\')');
            });

            it('produces the expected side-effects', function() {
                return versiondb.upgrade(connection, manifest)
                    .then(() => connection.query('SELECT version FROM versiondb.version WHERE product = \'example\''))
                    .then((result) => {
                        assert.equal(result.rows[0].version, '1.0.0');
                    })
                    .then(() => connection.query('SELECT schema_name FROM information_schema.schemata WHERE schema_name = \'example\''))
                    .then((result) => {
                        assert.equal(result.rowCount, 0);
                    });
            });

            it('returns the correct result', function() {
                return versiondb.upgrade(connection, manifest)
                    .then((obj) => {
                        assert.propertyVal(obj, 'result', 'success', 'result');
                        assert.equal(obj.manifest, manifest, 'manifest');
                        assert.equal(obj.initialVersion, '1.0.0', 'initialVersion');
                        assert.equal(obj.currentVersion, v1, 'currentVersion');
                        assert.deepEqual(obj.existingVersions, [v1], 'existingVersions');
                        assert.deepEqual(obj.updatedVersions, [], 'updatedVersions');
                        assert.deepEqual(obj.pendingVersions, [], 'pendingVersions');
                        assert.isNull(obj.failedVersion, 'failedVersion');
                        assert.isNull(obj.failedTask, 'failedTask');
                        assert.isNull(obj.failedTaskScript, 'failedTaskScript');
                        assert.isNull(obj.error, 'error');
                    });
            });

            it('emits the correct plan event', function() {
                const status = new EventEmitter();

                let plan = null;
                status.on('plan', (obj) => { plan = obj; });

                return versiondb.upgrade(connection, manifest, status)
                    .then(() => {
                        assert.isNotNull(plan);
                        assert.equal(plan.manifest, manifest, 'manifest');
                        assert.equal(plan.currentVersion, '1.0.0', 'currentVersion');
                        assert.equal(plan.targetVersion, '1.0.0', 'targetVersion');
                        assert.deepEqual(plan.existingVersions, [v1], 'existingVersions');
                        assert.deepEqual(plan.versions, [], 'versions');
                    });
            });
        });

        describe('emits the expected events', function() {
            const manifest = new MemoryManifest('example');
            const v1 = manifest.addVersion('1.0.0');
            const task1 = v1.addTask('example schema', 'CREATE SCHEMA example');
            v1.addTask('example.t table', 'CREATE TABLE example.t (id BIGSERIAL PRIMARY KEY, name varchar(255))');
            v1.addTask('populate example.t', 'INSERT INTO example.t (name) VALUES (\'one\'); INSERT INTO example.t (name) VALUES (\'two\')');
            const v2 = manifest.addVersion('1.0.1');
            v2.addTask('example.f&g tables', `
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT * FROM information_schema.tables WHERE table_schema = 'example' AND table_name = 'f') THEN
                    CREATE TABLE example.f (
                        id BIGSERIAL PRIMARY KEY,
                        name VARCHAR(255)
                    );
                    INSERT INTO example.f (name) VALUES ('one');
                END IF;
            END
            $$;
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT * FROM information_schema.tables WHERE table_schema = 'example' AND table_name = 'g') THEN
                    CREATE TABLE example.g (
                        id BIGSERIAL PRIMARY KEY,
                        name VARCHAR(255)
                    );
                    INSERT INTO example.g (name) VALUES ('two');
                END IF;
            END
            $$;`);
            const v3 = manifest.addVersion('1.0.2');
            v3.addTask('remove example.g', `
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT * FROM information_schema.columns WHERE table_schema = 'example' AND table_name = 'f' AND column_name = 'type') THEN
                    ALTER TABLE example.f ADD COLUMN type VARCHAR(3);
                    UPDATE example.f SET type = 'f';
                END IF;

                IF EXISTS (SELECT * FROM information_schema.tables WHERE table_schema = 'example' AND table_name = 'g') THEN
                    INSERT INTO example.f (name, type)
                    SELECT name, 'g' FROM example.g;

                    DROP TABLE example.g;
                END IF;
            END
            $$;
            `);
            const v4 = manifest.addVersion('1.0.3');
            v4.addTask('succeed', 'SELECT * FROM example.f');
            const failedTask = v4.addTask('fail', 'CREATE SCHEMA example');
            v4.addTask('not run', 'SELECT * FROM example.f');
            const v5 = manifest.addVersion('1.0.4');
            v5.addTask('should not run', 'SELECT * FROM example.f');

            it('emits the expected events', function() {
                const events = [];

                const status = new EventEmitter();
                status.on('versionStart', (data) => { events.push({ event: 'versionStart', data }); });
                status.on('versionEnd', (data) => { events.push({ event: 'versionEnd', data }); });
                status.on('taskStart', (data) => { events.push({ event: 'taskStart', data }); });
                status.on('taskEnd', (data) => { events.push({ event: 'taskEnd', data }); });

                return versiondb.upgrade(connection, manifest, status)
                    .then(() => {
                        assert.lengthOf(events, 22, 'Total number of events');
                        const versionStarts = events.filter((e) => e.event === 'versionStart');
                        const versionEnds = events.filter((e) => e.event === 'versionEnd');
                        const taskStarts = events.filter((e) => e.event === 'taskStart');
                        const taskEnds = events.filter((e) => e.event === 'taskEnd');
                        assert.lengthOf(versionStarts, 4, 'Number of version starts');
                        assert.lengthOf(versionEnds, 4, 'Number of version ends');
                        assert.lengthOf(taskStarts, 7, 'Number of task starts');
                        assert.lengthOf(taskEnds, 7, 'Number of task ends');

                        // Check that the version events for a successful
                        // version are what we expected.
                        assert.equal(versionStarts[0].data.manifest, manifest, 'versionStart(1.0.0).manifest');
                        assert.equal(versionStarts[0].data.version, v1, 'versionStart(1.0.0).version');
                        assert.equal(versionEnds[0].data.manifest, manifest, 'versionEnd(1.0.0).manifest');
                        assert.equal(versionEnds[0].data.version, v1, 'versionEnd(1.0.0).version');
                        assert.equal(versionEnds[0].data.result, 'success', 'versionEnd(1.0.0).result');

                        // Check that the version events for a failed
                        // version are what we expected.
                        assert.equal(versionStarts[3].data.manifest, manifest, 'versionStart(1.0.3).manifest');
                        assert.equal(versionStarts[3].data.version, v4, 'versionStart(1.0.3).version');
                        assert.equal(versionEnds[3].data.manifest, manifest, 'versionEnd(1.0.3).manifest');
                        assert.equal(versionEnds[3].data.version, v4, 'versionEnd(1.0.3).version');
                        assert.equal(versionEnds[3].data.result, 'error', 'versionEnd(1.0.3).result');
                        assert.instanceOf(versionEnds[3].data.error, Error, 'versionEnd(1.0.3).error');

                        // Check that the task events for a successful
                        // task are what we expected.
                        assert.equal(taskStarts[0].data.manifest, manifest, 'taskStart(1.0.0).manifest');
                        assert.equal(taskStarts[0].data.version, v1, 'taskStart(1.0.0).version');
                        assert.equal(taskStarts[0].data.task, task1, 'taskStart(1.0.0).task');
                        assert.equal(taskStarts[0].data.script, 'CREATE SCHEMA example', 'taskStart(1.0.0).script');
                        assert.equal(taskEnds[0].data.manifest, manifest, 'taskEnd(1.0.0).manifest');
                        assert.equal(taskEnds[0].data.version, v1, 'taskEnd(1.0.0).version');
                        assert.equal(taskEnds[0].data.task, task1, 'taskEnd(1.0.0).task');
                        assert.equal(taskEnds[0].data.script, 'CREATE SCHEMA example', 'taskEnd(1.0.0).script');
                        assert.equal(taskEnds[0].data.result, 'success', 'taskEnd(1.0.0).result');
                        // We return what PG gave us for the result. I guess the
                        // best way to test this is that the object has a
                        // rowCount,
                        assert.property(taskEnds[0].data.databaseResult, 'rowCount', 'taskEnd(1.0.0).databaseResult');

                        // Check that the task events for a failed
                        // task are what we expected.
                        assert.equal(taskStarts[6].data.manifest, manifest, 'taskStart(1.0.3).manifest');
                        assert.equal(taskStarts[6].data.version, v4, 'taskStart(1.0.3).version');
                        assert.equal(taskStarts[6].data.task, failedTask, 'taskStart(1.0.3).task');
                        assert.equal(taskStarts[6].data.script, 'CREATE SCHEMA example', 'taskStart(1.0.3).script');
                        assert.equal(taskEnds[6].data.manifest, manifest, 'taskEnd(1.0.3).manifest');
                        assert.equal(taskEnds[6].data.version, v4, 'taskEnd(1.0.3).version');
                        assert.equal(taskEnds[6].data.task, failedTask, 'taskEnd(1.0.3).task');
                        assert.equal(taskEnds[6].data.script, 'CREATE SCHEMA example', 'taskEnd(1.0.3).script');
                        assert.equal(taskEnds[6].data.result, 'error', 'taskEnd(1.0.3).result');
                        assert.instanceOf(taskEnds[6].data.error, Error, 'taskEnd(1.0.3).error');

                        // Assert that the events happened in the right order.
                        assert.deepEqual(
                            events.map((e) => e.event),
                            [
                                'versionStart', // 1.0.0
                                'taskStart',
                                'taskEnd',
                                'taskStart',
                                'taskEnd',
                                'taskStart',
                                'taskEnd',
                                'versionEnd',
                                'versionStart', // 1.0.1
                                'taskStart',
                                'taskEnd',
                                'versionEnd',
                                'versionStart', // 1.0.2
                                'taskStart',
                                'taskEnd',
                                'versionEnd',
                                'versionStart', // 1.0.3
                                'taskStart',
                                'taskEnd',
                                'taskStart',
                                'taskEnd',
                                'versionEnd',
                            ],
                            'Events happen in the right order'
                        );
                    });
            });
        });
    });
});

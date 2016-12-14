/* global describe, it, beforeEach, afterEach */
/* eslint "no-process-env":off */

'use strict';

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const pg = require('pg');
const versiondb = require('../lib/versiondb');

chai.use(chaiAsPromised);
const assert = chai.assert;

const db = process.env.DATABASE_URL;

describe('versiondb', function() {
    describe('initialize', function() {
        let connection = null;

        beforeEach(function(done) {
            pg.connect(db, (err, conn) => {
                if (err) { return done(err); }

                conn.query('DROP SCHEMA IF EXISTS versiondb CASCADE', (err) => {
                    if (err) {
                        conn.end();

                        return done(err);
                    }

                    connection = conn;
                    done();
                });
            });
        });

        afterEach(function() {
            if (connection) {
                connection.end();
            }
        });

        function assertInitialized() {
            return connection.query('SELECT * FROM information_schema.tables WHERE table_schema = \'versiondb\' AND table_name = \'version\'')
                .then((result) => {
                    assert.propertyVal(result, 'rowCount', 1);
                })
                .then(() => connection.query('SELECT product, version FROM versiondb.version WHERE product = \'versiondb\''))
                .then((result) => {
                    assert.propertyVal(result, 'rowCount', 1);
                    assert.equal(result.rows[0].product, 'versiondb');
                    assert.equal(result.rows[0].version, '1.0');
                });
        }

        it('create a version table when no schema exists', function() {
            const result = versiondb.initialize(connection);

            return assert.isFulfilled(result)
                .then((result) => {
                    assert.propertyVal(result, 'initialized', true);
                })
                .then(() => assertInitialized());
        });

        it('create a version table when the schema already exists', function() {
            return connection.query('CREATE SCHEMA versiondb')
                .then(() => versiondb.initialize(connection))
                .then((result) => {
                    assert.propertyVal(result, 'initialized', true);
                })
                .then(() => assertInitialized());
        });

        it('reinitializes if the table is there but versiondb is not a product', function() {
            return versiondb.initialize(connection)
                .then(() => connection.query('DELETE FROM versiondb.version WHERE product = \'versiondb\''))
                .then(() => versiondb.initialize(connection))
                .then((result) => {
                    assert.propertyVal(result, 'initialized', true);
                })
                .then(() => assertInitialized());
        });

        it('do nothing when the table already exists', function() {
            return versiondb.initialize(connection)
                .then(() => versiondb.initialize(connection))
                .then((result) => {
                    assert.propertyVal(result, 'initialized', false);
                })
                .then(() => assertInitialized());
        });
    });
});

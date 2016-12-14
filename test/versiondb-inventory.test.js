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
    describe('inventory', function() {
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

        it('returns successfully with no products when no schema exists', function() {
            const result = versiondb.inventory(connection);

            return assert.isFulfilled(result)
                .then((result) => {
                    assert.deepEqual(result, { exists: false, products: null });
                });
        });

        it('returns just versiondb when the schema exists', function() {
            return versiondb.initialize(connection)
                .then(() => versiondb.inventory(connection))
                .then((result) => {
                    assert.deepEqual(result, { exists: true, products: { versiondb: '1.0' } });
                });
        });

        it('returns many versions when they exist', function() {
            return versiondb.initialize(connection)
                .then(() => connection.query(`
                    INSERT INTO versiondb.version (product, version)
                    VALUES ('example1', '19850421'),
                           ('example2', '7')`))
                .then(() => versiondb.inventory(connection))
                .then((result) => {
                    assert.deepEqual(result, { exists: true, products: { versiondb: '1.0', example1: '19850421', example2: '7' } });
                    const keys = Object.keys(result.products);
                    for (let i = 0; i < keys.length - 1; i++) {
                        assert.isBelow(keys[i], keys[i + 1], `Expected product at index ${i} to be alphabetically sorted before product at index ${i + 1}`);
                    }
                });
        });

    });
});

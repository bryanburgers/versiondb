'use strict';

function checkExistence(conn) {
    return conn.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'versiondb' AND table_name = 'version'`)
        .then((result) => {
            if (result.rowCount < 1) {
                return false;
            }

            return conn.query(`SELECT version FROM versiondb.version WHERE product = 'versiondb'`)
                .then((result) => {
                    if (result.rowCount < 1) {
                        return false;
                    }

                    return true;
                });
        });
}

function createVersionDbSchema(conn) {
    const query = `
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'versiondb') THEN
            CREATE SCHEMA versiondb;
        END IF;
    END
    $$;
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'versiondb' AND table_name = 'version') THEN
            CREATE TABLE IF NOT EXISTS versiondb.version ( product varchar(255) PRIMARY KEY, version varchar(25) );
        END IF;
    END
    $$;
    INSERT INTO versiondb.version (product, version) VALUES ('versiondb', '1.0');
    `;

    return conn.query(query)
        .then(() => ({ initialized: true }));
}

function initialize(conn) {
    return checkExistence(conn)
        .then((exists) => {
            if (exists) {
                return { initialized: false };
            }

            return createVersionDbSchema(conn)
                .then(() => ({initialized: true }));
        });
}

module.exports = initialize;

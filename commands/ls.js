/* eslint "no-process-exit":off */

'use strict';

const chalk = require('chalk');
const columnify = require('columnify');
const pg = require('pg');
const versiondb = require('../lib/versiondb');

function error(message) {
    console.error(`${chalk.bgRed.white.bold(' ERROR ')} ${message}`);
}

function lsCommand(databaseOptions) {
    const conn = new pg.Client({
        user: databaseOptions.username,
        password: databaseOptions.password || '',
        database: databaseOptions.database,
        host: databaseOptions.host,
        port: databaseOptions.port,
    });
    conn.connect((err) => {
        if (err) {
            error(err.message);
            process.exit(1);
        }

        versiondb.inventory(conn)
            .then((result) => {
                console.log(columnify(result.exists ? result.products : [], {
                    columns: ['Product', 'Version'],
                    columnSplitter: '  ',
                }));
            })
            .catch((err) => {
                error(err.message);
                process.exit(1);
            })
            .then(() => {
                conn.end();
            });
    });
}

module.exports = lsCommand;

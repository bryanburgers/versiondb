/* eslint "no-process-exit":off */

'use strict';

const chalk = require('chalk');
const EventEmitter = require('events').EventEmitter;
const pg = require('pg');
const manifest = require('../lib/manifest');
const ora = require('ora');
const versiondb = require('../lib/versiondb');

function error(message) {
    console.error(`${chalk.bgRed.white.bold(' ERROR ')} ${message}`);
}

function runCommand(filename, databaseOptions) {
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

        manifest.readFromFile(filename)
        .catch((err) => {
            error(err.message);
            process.exit(1);
        })
        .then((manifest) => manifest.validateScriptsExist()
        .catch((err) => {
            error(err.message);
            process.exit(1);
        })
        .then(() => manifest))
        .then((manifest) => {
            const status = new EventEmitter();

            let progress = null;

            status.on('versionStart', (data) => {
                console.log(`${data.manifest.product}@${data.version.name}`);
            });
            status.on('taskStart', (data) => {
                progress = ora(data.task.name).start();
            });
            status.on('taskEnd', (data) => {
                if (data.result === 'success') {
                    progress.succeed();
                }
                else {
                    progress.fail();
                    console.error();
                    console.error(`${chalk.bgRed.white.bold(' ERROR ')} running task ${chalk.bold(data.task.name)} from version ${chalk.bold(data.version.name)}`);
                    console.error();
                    console.error('  ' + data.error.message);
                    console.error();
                }
            });
            status.on('versionEnd', (data) => {
                if (data.result === 'success') {
                    console.log();
                }
            });

            return versiondb.upgrade(conn, manifest, status)
                .then((result) => {
                    if (result.initialVersion === result.currentVersion.name) {
                        console.log(`👍 ${chalk.bgGreen.black(' CURRENT ')} ${result.manifest.product} is already at ${result.currentVersion.name}`);
                    }
                    else {
                        console.log(`👍 ${chalk.bgGreen.black(' UPDATED ')} ${result.manifest.product} is now at version ${result.currentVersion.name}`);
                    }
                    process.exit();
                })
            .catch(() => process.exit(1));
        })
        .catch((err) => console.log(err));
    });
}

module.exports = runCommand;

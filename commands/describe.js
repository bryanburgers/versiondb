/* eslint "no-process-exit":off */

'use strict';

const chalk = require('chalk');
const manifest = require('../lib/manifest');

function error(message) {
    console.error(`${chalk.bgRed.white.bold(' ERROR ')} ${message}`);
}

function describeCommand(filename) {
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
            console.log(`Product: ${manifest.product}`);
            for (const version of manifest.versions) {
                console.log();
                console.log(`${manifest.product}@${version.name}`);

                for (const task of version.tasks) {
                    console.log(`  - ${task.name}`);
                    console.log(`    ${task.path}`);
                }
            }
        });
}

module.exports = describeCommand;

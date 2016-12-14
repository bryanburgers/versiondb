/* eslint "no-process-exit":off */

'use strict';

const chalk = require('chalk');
const manifest = require('../lib/manifest');

function error(message) {
    console.error(`${chalk.bgRed.white.bold(' ERROR ')} ${message}`);
}

function validateCommand(filename) {
    manifest.readFromFile(filename)
        .catch((err) => {
            error(err.message);
            process.exit(1);
        })
        .then((manifest) => manifest.validateScriptsExist())
        .catch((err) => {
            error(err.message);
            process.exit(1);
        })
        .then(() => {
            console.log('👍');
        });
}

module.exports = validateCommand;

#!/usr/bin/env node
"use strict";

var currentVersion = require('./package.json').version;

var versiondb = require('./index.js');
var pg = require('pg');
var PgConnectionParameters = require('pg/lib/connection-parameters');

var program = require('commander');
var filebundle = require('versiondb-bundle-file');

program
	.version(currentVersion)
	.usage('[options] <database url> [schema file]')
	.option('-s, --secure', 'Use a secure connection')
	.parse(process.argv);

var database = program.args[0];
var file = program.args[1];

if (!database) {
	program.help();
}

var db = new PgConnectionParameters(database);
if (program.secure) {
	db.ssl = program.secure;
}

if (!file) {
	pg.connect(db, function(err, connection) {
		if (err) {
			console.error(err.message);
			process.exit(1);
		}

		versiondb.check(connection, function(err, data) {
			if (err) {
				console.error(err.message);
				process.exit(1);
			}

			if (data.exists) {
				var products = Object.keys(data.products);
				products.sort();

				products.forEach(function (key) {
					console.log(key + "@" + data.products[key]);
				});
			}
			else {
				// Not actually an error, but we want to output only the
				// products and their versions of stdout, so let's output
				// this on stderr.
				console.error("No products");
			}

			process.exit();
		});
	});
}
else {
	filebundle(file, function(err, bundle) {
		if (err) {
			console.error(err.message);
			process.exit(1);
		}

		pg.connect(db, function(err, connection) {
			if (err) {
				console.error(err.message);
				process.exit(1);
			}

			var status = versiondb.upgrade(connection, bundle);
			status.on('error', function(err) {
				console.error(err.message);
				process.exit(1);
			});
			status.on('plan', function(data) {
				if (data.success) {
					if (data.upgradeVersions.length == 0) {
						console.log(data.product + ' is already up to date');
					}
					else {
						console.log('Updating ' + data.product);
						if (data.databaseVersion) {
							console.log('Current version: ' + data.databaseVersion);
						}
						else {
							console.log('No current version');
						}

						if (data.targetVersion) {
							console.log('Target version: ' + data.targetVersion);
						}
					}
				}
				else {
					console.error('Cannot upgrade ' + data.product);
					console.error('(' + data.error.message + ')');
				}
			});
			status.on('version', function(data) {
				if (data.success) {
					console.log(data.product + '@' + data.version + ': OK');
				}
				else {
					console.error(data.product + '@' + data.version + ': Rolled back (' + data.error.message + ')');
				}
			});
			status.on('product', function(data) {
				if (data.success) {
					console.log('Successfully upgraded to: ' + data.product + '@' + data.version);
				}
				else {
					console.log('An upgrade failed. Current version is now: ' + data.product + '@' + data.version);
				}
			});
			status.on('complete', function() {
				console.log("Done");
				process.exit();
			});
		});
	});
}

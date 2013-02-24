#!/usr/bin/env node
"use strict";

var currentVersion = require('./package.json').version;

var versiondb = require('./index.js');
var pg = require('pg');
var PgConnectionParameters = require('pg/lib/connection-parameters');

var program = require('commander');

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
	versiondb.upgrade(db, file, function() {
		process.exit();
	});
}

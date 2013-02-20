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
			console.log(err.message);
			process.exit();
		}

		versiondb.check(connection, function(err, data) {
			if (err) {
				console.log(err.message);
				process.exit();
			}

			if (data.exists) {
				var products = Object.keys(data.products);
				products.sort();

				products.forEach(function (key) {
					console.log(key + "@" + data.products[key]);
				});
			}
			else {
				console.log("No products");
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

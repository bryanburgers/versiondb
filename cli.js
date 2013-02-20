#!/usr/bin/env node
"use strict";

var currentVersion = require('./package.json').version;

var versiondb = require('./index.js');
var pg = require('pg');

var program = require('commander');

program
	.version(currentVersion)
	.usage('[options] <database url> [schema file]')
	.parse(process.argv);

var database = program.args[0];
var file = program.args[1];

if (!database) {
	program.help();
}

if (!file) {
	pg.connect(database, function(err, connection) {
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
	versiondb.upgrade(database, file, function() {
		process.exit();
	});
}

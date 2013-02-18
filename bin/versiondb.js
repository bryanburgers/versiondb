#!/usr/bin/env node
"use strict";

var versiondb = require('../index.js');
var pg = require('pg');

var database = process.argv[2];
var file = process.argv[3];

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

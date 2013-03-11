"use strict";

var async = require('async');
var fs = require('fs');
var path = require('path');
var pg = require('pg');
var semver = require('semver');
var VersionDBUpgrader = require('./VersionDBUpgrader');

function maybeCreateVersionSchema(connection, callback) {
	connection.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'versiondb'", function(err, result) {
		if (err) {
			return callback(err);
		}

		if (result.rowCount === 0) {
			connection.query("CREATE SCHEMA versiondb", function(err) {
				if (err) {
					return callback(err);
				}

				return callback(null, { created: true });
			});
		}
		else {
			return callback(null, { created: false });
		}
	});
}

function maybeCreateVersionTable(connection, callback) {
	connection.query("SELECT * FROM information_schema.tables WHERE table_schema = 'versiondb' AND table_name = 'version'", function(err, result) {
		if (err) {
			return callback(err);
		}

		if (result.rowCount === 0) {
			connection.query("CREATE TABLE IF NOT EXISTS versiondb.version ( product varchar(255) PRIMARY KEY, version varchar(25) );", function(err, result) {
				if (err) {
					return callback(err);
				}

				return callback(null, { created: true });
			});
		}
		else {
			return callback(null, { created: false });
		}
	});
}

function createVersionTable(connection, callback) {
	maybeCreateVersionSchema(connection, function(err, schemaData) {
		if (err) {
			return callback(err);
		}

		maybeCreateVersionTable(connection, function(err, tableData) {
			if (err) {
				return callback(err);
			}

			return callback(null, {
				schemaCreated: schemaData.created,
				tableCreated: tableData.created
			});
		});
	});
}

exports.createVersionTable = createVersionTable;

function check(connection, callback) {
	connection.query("SELECT * FROM information_schema.tables WHERE table_schema = 'versiondb' AND table_name = 'version'", function(err, result) {
		if (err) {
			return callback(err);
		}

		if (result.rowCount === 0) {
			return callback(null, {
				exists: false,
				products: {}
			});
		}
		else {
			connection.query("SELECT product, version FROM versiondb.version ORDER BY product, version", function(err, result) {
				if (err) {
					return callback(err);
				}

				var products = {};
				result.rows.forEach(function(row) {
					products[row.product] = row.version;
				});

				return callback(null, {
					exists: true,
					products: products
				});
			});
		}
	});
}

exports.check = check;

function upgrade(connection, bundle) {
	var upgrader = new VersionDBUpgrader(connection, bundle);
	upgrader.upgrade();
	return upgrader;
}

exports.upgrade = upgrade;

"use strict";

var async = require('async');
var fs = require('fs');
var path = require('path');
var pg = require('pg');
var semver = require('semver');

function createVersionTable(connection, next) {
	console.log("Checking for 'ver.version' table...");
	connection.query("SELECT * FROM information_schema.tables WHERE table_schema = 'ver' AND table_name = 'version'", function(err, result) {
		if (err) {
			next(err);
		}

		if (result.rowCount === 0) {
			console.log("'ver.version' table does not exist. Creating...");
			connection.query("CREATE SCHEMA ver;", function(err, result) {
				if (err) {
					next(err);
					return;
				}

				connection.query("CREATE TABLE IF NOT EXISTS ver.version ( product varchar(50) PRIMARY KEY, version varchar(8) );", function(err, result) {
					console.log("ver.version created.");
					next(err);
				});
			});
		}
		else {
			console.log("ver.version table exists.");
			next(err);
		}
	});
}

function getSchemaVersion(connection, product, next) {
	console.log("Getting product version for product '" + product + "'...");
	connection.query("SELECT version FROM ver.version WHERE product = $1", [product], function(err, result) {
		if (err) {
			next(err);
			return;
		}

		if (result.rowCount === 0) {
			console.log("No product version found. Product must be created.");
			next(null, null);
		}
		else {
			var ver = result.rows[0]['version'];

			if (!semver.valid(ver)) {
				console.log("Found database version '" + ver + "' is invalid.");
				next(new Error("Found database version '" + ver + "' is invalid."));
			}

			ver = semver.clean(ver);

			console.log("Database version: " + product + "@" + ver);
			next(null, ver);
		}
	});
}

function runUpdate(connection, product, version, filename, create, next) {
	fs.readFile(filename, function(err, data) {
		if (err) {
			next(err);
			return;
		}

		var query = data.toString('utf-8');
		var queries = query.split(/;\s*\n/);

		connection.query("BEGIN", function(err, result) {
			if (err) { next(err); return; }

			async.forEachSeries(queries, function(query, next) {
				if (query.indexOf('\uFEFF') === 0) {
					query = query.substring(1);
				}
				connection.query(query, next);
			}, function(err) {
				if (err) {
					console.log(err);
					console.log("Rolling back");
					connection.query("ROLLBACK", function() {
						return next(err);
					});
				}
				else {
					var schemaQuery = "UPDATE ver.version SET version = $1 WHERE product = $2";
					if (create) {
						schemaQuery = "INSERT INTO ver.version (product, version) VALUES ($2, $1)";
					}
					connection.query(schemaQuery, [version, product], function(err, result) {
						connection.query("COMMIT", function(err) {
							if (err) {
								console.log(err);
								return next(err);
							}

							console.log('Committed ' + product + '@' + version);
							return next();
						});
					});
				}
			});
		});
	});
}

function check(connection, callback) {
	connection.query("SELECT * FROM information_schema.tables WHERE table_schema = 'ver' AND table_name = 'version'", function(err, result) {
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
			connection.query("SELECT product, version FROM ver.version ORDER BY product, version", function(err, result) {
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

function upgrade(databaseUrl, schemaFile, callback) {

	// Load config file
	fs.readFile(schemaFile, 'utf-8', function(err, jsonData) {
		if (err) {
			console.log("Couldn't read file '" + schemaFile + "'.");
			return callback(err);
		}

		try {
			var conf = JSON.parse(jsonData);
		}
		catch (err) {
			console.log("File '" + schemaFile + '" is not valid JSON.');
			return callback(err);
		}

		var rootDir = path.dirname(schemaFile);

		// Connect to the database
		console.log("Connecting to the database...");
		pg.connect(databaseUrl, function(err, connection) {
			if (err) {
				console.log("Failed to connect: " + err);
				return;
			}

			console.log("Connected.");
			console.log("");

			var schemas = Object.keys(conf);

			createVersionTable(connection, function(err) {
				if (err) { console.log("ERROR: " + err); return; }

				async.forEachSeries(schemas, function(product, next) {
					console.log("");
					console.log("*");
					console.log("* " + product);
					console.log("*");
					var versions = Object.keys(conf[product]);
					var invalidVersion = false;
					for (var i = 0; i < versions.length; i++) {
						if (!semver.valid(versions[i])) {
							console.log("Invalid version " + versions[i]);
							invalidVersion = true;
						}
						else {
							versions[i] = semver.clean(versions[i]);
						}
					}

					if (invalidVersion) {
						next(new Error("Invalid versions were found."));
						return;
					}

					versions.sort(semver.compare);

					console.log("Found versions: " + versions);

					getSchemaVersion(connection, product, function(err, version) {
						if (err) { console.log("ERROR: " + err); next(err); return; }

						var startIndex = 0;
						if (version == null) {
							// Schema doesn't exist, so we need to run all of the versions.
							console.log("Schema doesn't exist; running all version scripts.");
							startIndex = 0;
						}
						else {
							var index = versions.indexOf(version);
							if (index < 0) {
								console.log("Version '" + version + "' is not found in version list. Can't continue.");
								next();
								return;
							}

							// We don't need to run the one we're currently on. Go to the next one.
							startIndex = index + 1;
						}

						var updateVersions = versions.slice(startIndex);
						if (updateVersions.length > 0) {
							console.log("Running updates for versions: " + updateVersions);

							// We can't do an upsert on ver.version, so we need to know whether
							// we're going to INSERT or UPDATE.
							var create = startIndex === 0;

							async.forEachSeries(updateVersions, function (version, next) {
								runUpdate(connection, product, version, path.resolve(rootDir, conf[product][version]), create, next);
								create = false;
							}, function(err) {
								if (err) {
									console.log(err);
								}

								next();
							});
						}
						else {
							console.log("Product '" + product + "' is up to date.");
							next();
						}
					});
				}, function(err) {
					callback(err);
				});
			});
		});
	});
}

exports.upgrade = upgrade;

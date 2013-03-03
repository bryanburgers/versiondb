"use strict";

var async = require('async');
var semver = require('semver');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var versiondb = require('./index.js');

function VersionDBUpgrader(connection, bundle) {
	EventEmitter.call(this);
	this.connection = connection;
	this.bundle = bundle;
}

util.inherits(VersionDBUpgrader, EventEmitter);

VersionDBUpgrader.prototype.getSchemaVersion = function(product, next) {
	var self = this;

	self.connection.query("SELECT version FROM ver.version WHERE product = $1", [product], function(err, result) {
		if (err) {
			next(err);
			return;
		}

		if (result.rowCount === 0) {
			//self.emit('versionCheck', { product: product, version: null });
			next(null, null);
		}
		else {
			var ver = result.rows[0]['version'];

			if (!semver.valid(ver)) {
				//console.log("Found database version '" + ver + "' is invalid.");
				next(new Error("Found database version '" + ver + "' is invalid."));
			}

			ver = semver.clean(ver);

			//self.emit('versionCheck', { product: product, version: ver });
			next(null, ver);
		}
	});
};

VersionDBUpgrader.prototype.runUpdate = function(product, version, create, next) {
	var self = this;

	self.bundle.getUpdateQuery(product, version, function(err, query) {
		if (err) {
			next(err);
			return;
		}

		var queries = query.split(/;\s*\n/);

		self.connection.query("BEGIN", function(err, result) {
			if (err) {
				return next(err);
			}

			async.forEachSeries(queries, function(query, next) {
				if (query.indexOf('\uFEFF') === 0) {
					query = query.substring(1);
				}
				self.connection.query(query, next);
			}, function(err) {
				if (err) {
					self.emit('version', { product: product, version: version, success: false, error: err });
					self.connection.query("ROLLBACK", function() {
						// We don't need to return the error, because we've dealt with it.
						// Do we need to keep track of failed versions?
						err.handled = true;
						return next(err);
						//return next(err);
					});
				}
				else {
					var schemaQuery = "UPDATE ver.version SET version = $1 WHERE product = $2";
					if (create) {
						schemaQuery = "INSERT INTO ver.version (product, version) VALUES ($2, $1)";
					}
					self.connection.query(schemaQuery, [version, product], function(err, result) {
						self.connection.query("COMMIT", function(err) {
							if (err) {
								return next(err);
							}

							self.emit('version', { product: product, version: version, success: true });
							return next();
						});
					});
				}
			});
		});
	});
};

VersionDBUpgrader.prototype.upgrade = function() {
	var self = this;

	process.nextTick(function() {

		versiondb.createVersionTable(self.connection, function(err) {
			if (err) {
				self.emit('error', err);
				return;
			}

			var products = self.bundle.getProducts();

			async.forEachSeries(products, function(product, next) {

				//self.emit('productStarted', { product: product });

				var versions = self.bundle.getVersions(product);

				var invalidVersion = false;
				for (var i = 0; i < versions.length; i++) {
					if (!semver.valid(versions[i])) {
						//console.log("Invalid version " + versions[i]);
						invalidVersion = true;
					}
					else {
						versions[i] = semver.clean(versions[i]);
					}
				}

				if (invalidVersion) {
					self.emit('error', new Error("Invalid versions were found."));
					return;
				}

				versions.sort(semver.compare);

				//self.emit('productVersions', { product: product, versions: versions });

				self.getSchemaVersion(product, function(err, databaseVersion) {
					if (err) {
						self.emit('plan', {
							product: product,
							bundleVersions: versions,
							databaseVersion: null,
							upgradeVersions: [],
							success: false,
							error: err
						});
						return next();
					}

					var startIndex = 0;
					if (databaseVersion === null) {
						// Schema doesn't exist, so we need to run all of the versions.
						//console.log("Schema doesn't exist; running all version scripts.");
						//self.emit('x', 'Schema doesn\'t exist; running all version scripts.');
						startIndex = 0;
					}
					else {
						var index = versions.indexOf(databaseVersion);
						if (index < 0) {
							var error = new Error("Version '" + databaseVersion + "' is not found in version list. Can't continue.");
							self.emit('plan', {
								product: product,
								bundleVersions: versions,
								databaseVersion: databaseVersion,
								upgradeVersions: [],
								success: false,
								error: error
							});
							self.emit('product', {
								product: product,
								initialVersion: databaseVersion,
								targetVersion: versions[versions.length - 1],
								version: databaseVersion,
								success: false,
								error: error
							});
							return next();
						}

						// We don't need to run the one we're currently on. Go to the next one.
						startIndex = index + 1;
					}

					var updateVersions = versions.slice(startIndex);
					var targetVersion = updateVersions[updateVersions.length - 1];

					self.emit('plan', {
						product: product,
						bundleVersions: versions,
						databaseVersion: databaseVersion,
						upgradeVersions: updateVersions,
						success: true
					});

					if (updateVersions.length > 0) {
						//self.emit('updates', { product: product, versions: updateVersions });

						// We can't do an upsert on ver.version, so we need to know whether
						// we're going to INSERT or UPDATE.
						var create = startIndex === 0;
						var previousVersion = null;
						var lastVersion = null;

						async.forEachSeries(updateVersions, function (version, next) {
							previousVersion = lastVersion;
							lastVersion = version;
							self.runUpdate(product, version, create, next);
							create = false;
						}, function(err) {
							// Run update will handle certain errors on its own,
							// which doesn't prevent us from proceeding. If that's the
							// case, it will set the 'handled' property.
							// If that property is not set, it's a fatal error that we
							// need to report.
							if (err && !err.handled) {
								self.emit('error', err);
							}

							if (err) {
								lastVersion = previousVersion;
							}

							self.emit('product', {
								product: product,
								initialVersion: databaseVersion,
								targetVersion: targetVersion,
								version: lastVersion,
								success: !err,
								error: err
							});

							next();
						});
					}
					else {
						self.emit('product', {
							product: product,
							initialVersion: databaseVersion,
							targetVersion: databaseVersion,
							version: databaseVersion,
							success: true,
							error: null
						});
						next();
					}
				});
			}, function(err) {
				if (err) {
					self.emit('error', err);
				}

				self.emit('complete');
			});
		});
	});
};

module.exports = VersionDBUpgrader;

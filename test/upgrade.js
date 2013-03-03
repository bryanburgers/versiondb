var pg = require('pg');
var should = require('should');
var versiondb = require('../');
var memorybundle = require('versiondb-bundle-memory');

var db = process.env.DATABASE_URL;

function connect(callback) {
	pg.connect(db, callback);
}

function clear(database, callback) {
	database.query("DROP SCHEMA ver CASCADE", function(err) {
		// We might get an error that it does not exist. That's fine.

		database.query("DROP SCHEMA example CASCADE", function(err) {
			// We might get an error that it does not exist. That's fine.

			database.query("DROP SCHEMA other CASCADE", function(err) {
				// We might get an error that it does not exist. That's fine.

				return callback();
			});
		});
	});
}

function prep(callback) {
	connect(function(err, database) {
		if (err) {
			return callback(err);
		}

		clear(database, function(err) {
			if (err) {
				return callback(err);
			}

			return callback(null, database);
		});
	});
}

function prepWithVersionTable(callback) {
	prep(function(err, database) {
		if (err) {
			return callback(err);
		}

		versiondb.createVersionTable(database, function(err, data) {
			if (err) {
				return callback(err);
			}

			return callback(null, database);
		});
	});
}

describe('upgrade', function() {
	// Test event emitter output, as well.

	it('upgrades successfully from nothing', function(done) {
		prep(function(err, database) {
			should.not.exist(err);

			var bundle = memorybundle();
			bundle.addUpdateQuery("example", "1.0.0", "CREATE SCHEMA example");

			var status = versiondb.upgrade(database, bundle);

			status.once('error', function() {
				throw new Error('Error was called');
			});

			var plan = {};
			status.on('plan', function(data) {
				plan[data.product] = data;
			});

			var versions = {};
			status.on('version', function(data) {
				versions[data.product + '@' + data.version] = data;
			});

			var products = {};
			status.on('product', function(data) {
				products[data.product] = data;
			});

			status.once('complete', function() {
				database.query("SELECT version FROM ver.version WHERE product = 'example'", function(err, result) {
					should.not.exist(err);

					result.rows[0].version.should.eql('1.0.0');
					versions.should.have.property('example@1.0.0');
					versions['example@1.0.0'].should.have.property('success', true);

					plan.should.have.property('example');
					plan['example'].should.have.property('success', true);
					plan['example'].should.have.property('bundleVersions');
					plan['example'].bundleVersions.should.eql(["1.0.0"]);
					plan['example'].should.have.property('databaseVersion', null);
					plan['example'].should.have.property('upgradeVersions');
					plan['example'].upgradeVersions.should.eql(["1.0.0"]);

					products.should.have.property('example');
					products['example'].should.have.property('initialVersion', null);
					products['example'].should.have.property('version', '1.0.0');
					products['example'].should.have.property('targetVersion', '1.0.0');
					products['example'].should.have.property('success', true);

					done();
				});
			});
		});
	});

	it('upgrades a pre-existing version', function(done) {
		prepWithVersionTable(function(err, database) {
			should.not.exist(err);

			var bundle = memorybundle();
			bundle.addUpdateQuery("example", "1.0.0", "CREATE SCHEMA example");
			bundle.addUpdateQuery("example", "1.0.1", "CREATE SCHEMA other");

			database.query("INSERT INTO ver.version VALUES ('example', '1.0.0')", function(err) {
				should.not.exist(err);

				var status = versiondb.upgrade(database, bundle);

				status.once('error', function() {
					throw new Error('Error was called');
				});

				var plan = {};
				status.on('plan', function(data) {
					plan[data.product] = data;
				});

				var versions = {};
				status.on('version', function(data) {
					versions[data.product + '@' + data.version] = data;
				});

				var products = {};
				status.on('product', function(data) {
					products[data.product] = data;
				});

				status.once('complete', function() {

					versions.should.not.have.property('example@1.0.0');
					versions.should.have.property('example@1.0.1');
					versions['example@1.0.1'].should.have.property('success', true);

					plan.should.have.property('example');
					plan['example'].should.have.property('success', true);
					plan['example'].should.have.property('bundleVersions');
					plan['example'].bundleVersions.should.eql(["1.0.0", "1.0.1"]);
					plan['example'].should.have.property('databaseVersion', "1.0.0");
					plan['example'].should.have.property('upgradeVersions');
					plan['example'].upgradeVersions.should.eql(["1.0.1"]);

					products.should.have.property('example');
					products['example'].should.have.property('initialVersion', '1.0.0');
					products['example'].should.have.property('version', '1.0.1');
					products['example'].should.have.property('targetVersion', '1.0.1');
					products['example'].should.have.property('success', true);

					database.query("SELECT version FROM ver.version WHERE product = 'example'", function(err, result) {
						should.not.exist(err);

						// Should be updated
						result.rows[0].version.should.eql('1.0.1');

						// Should not have called the first query
						database.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'example'", function(err, result) {
							result.rowCount.should.eql(0);

							database.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'other'", function(err, result) {
								result.rowCount.should.eql(1);

								done();
							});
						});
					});
				});
			});
		});
	});

	it('upgrades multiple products', function(done) {
		prep(function(err, database) {
			should.not.exist(err);

			var bundle = memorybundle();
			bundle.addUpdateQuery("example", "1.0.0", "CREATE SCHEMA example");
			bundle.addUpdateQuery("other", "2.0.0", "CREATE SCHEMA other");

			var status = versiondb.upgrade(database, bundle);

			status.once('error', function() {
				throw new Error('Error was called');
			});

			var plan = {};
			status.on('plan', function(data) {
				plan[data.product] = data;
			});

			var versions = {};
			status.on('version', function(data) {
				versions[data.product + '@' + data.version] = data;
			});

			var products = {};
			status.on('product', function(data) {
				products[data.product] = data;
			});

			status.once('complete', function() {

				versions.should.have.property('example@1.0.0');
				versions['example@1.0.0'].should.have.property('success', true);
				versions.should.have.property('other@2.0.0');
				versions['other@2.0.0'].should.have.property('success', true);

				plan.should.have.property('example');
				plan['example'].should.have.property('success', true);
				plan['example'].should.have.property('bundleVersions');
				plan['example'].bundleVersions.should.eql(["1.0.0"]);
				plan['example'].should.have.property('databaseVersion', null);
				plan['example'].should.have.property('upgradeVersions');
				plan['example'].upgradeVersions.should.eql(["1.0.0"]);
				plan.should.have.property('other');
				plan['other'].should.have.property('success', true);
				plan['other'].should.have.property('bundleVersions');
				plan['other'].bundleVersions.should.eql(["2.0.0"]);
				plan['other'].should.have.property('databaseVersion', null);
				plan['other'].should.have.property('upgradeVersions');
				plan['other'].upgradeVersions.should.eql(["2.0.0"]);

				products.should.have.property('example');
				products['example'].should.have.property('initialVersion', null);
				products['example'].should.have.property('version', '1.0.0');
				products['example'].should.have.property('targetVersion', '1.0.0');
				products['example'].should.have.property('success', true);
				products.should.have.property('other');
				products['other'].should.have.property('initialVersion', null);
				products['other'].should.have.property('version', '2.0.0');
				products['other'].should.have.property('targetVersion', '2.0.0');
				products['other'].should.have.property('success', true);

				database.query("SELECT version FROM ver.version WHERE product = 'example' OR product = 'other' ORDER BY product", function(err, result) {
					should.not.exist(err);

					result.rows[0].version.should.eql('1.0.0');
					result.rows[1].version.should.eql('2.0.0');

					done();
				});
			});
		});
	});

	it('gracefully fails on the first version', function(done) {
		prep(function(err, database) {
			should.not.exist(err);

			var bundle = memorybundle();
			bundle.addUpdateQuery("example", "1.0.0", "CREATE SCHEMA example;\nCREATE SCHEMA example");

			var status = versiondb.upgrade(database, bundle);

			status.once('error', function() {
				throw new Error('Error was called');
			});

			var plan = {};
			status.on('plan', function(data) {
				plan[data.product] = data;
			});

			var versions = {};
			status.on('version', function(data) {
				versions[data.product + '@' + data.version] = data;
			});

			var products = {};
			status.on('product', function(data) {
				products[data.product] = data;
			});

			status.once('complete', function() {

				versions.should.have.property('example@1.0.0');
				versions['example@1.0.0'].should.have.property('success', false);
				versions['example@1.0.0'].should.have.property('error');

				plan.should.have.property('example');
				plan['example'].should.have.property('success', true);
				plan['example'].should.have.property('bundleVersions');
				plan['example'].bundleVersions.should.eql(["1.0.0"]);
				plan['example'].should.have.property('databaseVersion', null);
				plan['example'].should.have.property('upgradeVersions');
				plan['example'].upgradeVersions.should.eql(["1.0.0"]);

				products.should.have.property('example');
				products['example'].should.have.property('initialVersion', null);
				products['example'].should.have.property('version', null);
				products['example'].should.have.property('targetVersion', '1.0.0');
				products['example'].should.have.property('success', false);
				products['example'].should.have.property('error');

				database.query("SELECT version FROM ver.version WHERE product = 'example'", function(err, result) {
					should.not.exist(err);

					result.rowCount.should.eql(0);

					done();
				});
			});
		});
	});

	it('gracefully fails on a later version', function(done) {
		prep(function(err, database) {
			should.not.exist(err);

			var bundle = memorybundle();
			bundle.addUpdateQuery("example", "1.0.0", "CREATE SCHEMA example");
			bundle.addUpdateQuery("example", "1.0.1", "CREATE SCHEMA other;\nCREATE SCHEMA other");

			var status = versiondb.upgrade(database, bundle);

			status.once('error', function() {
				throw new Error('Error was called');
			});

			var plan = {};
			status.on('plan', function(data) {
				plan[data.product] = data;
			});

			var versions = {};
			status.on('version', function(data) {
				versions[data.product + '@' + data.version] = data;
			});

			var products = {};
			status.on('product', function(data) {
				products[data.product] = data;
			});

			status.once('complete', function() {

				versions.should.have.property('example@1.0.0');
				versions['example@1.0.0'].should.have.property('success', true);
				versions.should.have.property('example@1.0.1');
				versions['example@1.0.1'].should.have.property('success', false);
				versions['example@1.0.1'].should.have.property('error');

				plan.should.have.property('example');
				plan['example'].should.have.property('success', true);
				plan['example'].should.have.property('bundleVersions');
				plan['example'].bundleVersions.should.eql(["1.0.0", "1.0.1"]);
				plan['example'].should.have.property('databaseVersion', null);
				plan['example'].should.have.property('upgradeVersions');
				plan['example'].upgradeVersions.should.eql(["1.0.0", "1.0.1"]);

				products.should.have.property('example');
				products['example'].should.have.property('initialVersion', null);
				products['example'].should.have.property('version', '1.0.0');
				products['example'].should.have.property('targetVersion', '1.0.1');
				products['example'].should.have.property('success', false);
				products['example'].should.have.property('error');

				database.query("SELECT version FROM ver.version WHERE product = 'example'", function(err, result) {
					should.not.exist(err);

					result.rows[0].version.should.eql('1.0.0');

					database.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'example'", function(err, result) {
						should.not.exist(err);

						result.rowCount.should.eql(1);

						done();
					});
				});
			});
		});
	});

	it('stops running on an upgrade failure', function(done) {
		prep(function(err, database) {
			should.not.exist(err);

			var bundle = memorybundle();
			bundle.addUpdateQuery("example", "1.0.0", "CREATE SCHEMA example");
			bundle.addUpdateQuery("example", "1.0.1", "CREATE SCHEMA other;\nCREATE SCHEMA other");
			bundle.addUpdateQuery("example", "1.0.2", "CREATE TABLE example.t (id integer PRIMARY KEY)");

			var status = versiondb.upgrade(database, bundle);

			status.once('error', function() {
				throw new Error('Error was called');
			});

			var plan = {};
			status.on('plan', function(data) {
				plan[data.product] = data;
			});

			var versions = {};
			status.on('version', function(data) {
				versions[data.product + '@' + data.version] = data;
			});

			var products = {};
			status.on('product', function(data) {
				products[data.product] = data;
			});

			status.once('complete', function() {

				versions.should.have.property('example@1.0.0');
				versions['example@1.0.0'].should.have.property('success', true);
				versions.should.have.property('example@1.0.1');
				versions['example@1.0.1'].should.have.property('success', false);
				versions['example@1.0.1'].should.have.property('error');
				versions.should.not.have.property('example@1.0.2');

				plan.should.have.property('example');
				plan['example'].should.have.property('success', true);
				plan['example'].should.have.property('bundleVersions');
				plan['example'].bundleVersions.should.eql(["1.0.0", "1.0.1", "1.0.2"]);
				plan['example'].should.have.property('databaseVersion', null);
				plan['example'].should.have.property('upgradeVersions');
				plan['example'].upgradeVersions.should.eql(["1.0.0", "1.0.1", "1.0.2"]);

				products.should.have.property('example');
				products['example'].should.have.property('initialVersion', null);
				products['example'].should.have.property('version', '1.0.0');
				products['example'].should.have.property('targetVersion', '1.0.2');
				products['example'].should.have.property('success', false);
				products['example'].should.have.property('error');

				database.query("SELECT version FROM ver.version WHERE product = 'example'", function(err, result) {
					should.not.exist(err);

					result.rows[0].version.should.eql('1.0.0');

					database.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'example'", function(err, result) {
						should.not.exist(err);

						result.rowCount.should.eql(1);

						database.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'example' AND table_name = 't'", function(err, result) {
							should.not.exist(err);

							result.rowCount.should.eql(0);

							done();
						});
					});
				});
			});
		});
	});

	it('does nothing when versions can not be reconciled', function(done) {
		prepWithVersionTable(function(err, database) {
			should.not.exist(err);

			var bundle = memorybundle();
			bundle.addUpdateQuery("example", "1.0.0", "CREATE SCHEMA example");

			database.query("INSERT INTO ver.version VALUES ('example', '0.7.0')", function(err) {
				should.not.exist(err);

				var status = versiondb.upgrade(database, bundle);

				status.once('error', function() {
					throw new Error('Error was called');
				});

				var plan = {};
				status.on('plan', function(data) {
					plan[data.product] = data;
				});

				var products = {};
				status.on('product', function(data) {
					products[data.product] = data;
				});

				status.once('complete', function() {
					database.query("SELECT version FROM ver.version WHERE product = 'example'", function(err, result) {
						should.not.exist(err);

						// Should be updated
						result.rows[0].version.should.eql('0.7.0');

						plan.should.have.property('example');
						plan['example'].should.have.property('success', false);
						plan['example'].should.have.property('bundleVersions');
						plan['example'].bundleVersions.should.eql(["1.0.0"]);
						plan['example'].should.have.property('databaseVersion', "0.7.0");
						plan['example'].should.have.property('error');

						products.should.have.property('example');
						products['example'].should.have.property('initialVersion', '0.7.0');
						products['example'].should.have.property('version', '0.7.0');
						products['example'].should.have.property('targetVersion', '1.0.0');
						products['example'].should.have.property('success', false);
						products['example'].should.have.property('error');

						// Should not have called the first query
						database.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'example'", function(err, result) {
							result.rowCount.should.eql(0);

							done();
						});
					});
				});
			});
		});
	});

	it('does nothing when already up to date', function(done) {
		prepWithVersionTable(function(err, database) {
			should.not.exist(err);

			var bundle = memorybundle();
			bundle.addUpdateQuery("example", "1.0.0", "CREATE SCHEMA example");

			database.query("INSERT INTO ver.version VALUES ('example', '1.0.0')", function(err) {
				should.not.exist(err);

				var status = versiondb.upgrade(database, bundle);

				status.once('error', function() {
					throw new Error('Error was called');
				});

				var plan = {};
				status.on('plan', function(data) {
					plan[data.product] = data;
				});

				var products = {};
				status.on('product', function(data) {
					products[data.product] = data;
				});

				status.once('complete', function() {
					database.query("SELECT version FROM ver.version WHERE product = 'example'", function(err, result) {
						should.not.exist(err);

						// Should be updated
						result.rows[0].version.should.eql('1.0.0');

						plan.should.have.property('example');
						plan['example'].should.have.property('success', true);
						plan['example'].should.have.property('bundleVersions');
						plan['example'].bundleVersions.should.eql(["1.0.0"]);
						plan['example'].should.have.property('databaseVersion', "1.0.0");
						plan['example'].should.have.property('upgradeVersions');
						plan['example'].upgradeVersions.should.eql([]);

						products.should.have.property('example');
						products['example'].should.have.property('initialVersion', '1.0.0');
						products['example'].should.have.property('version', '1.0.0');
						products['example'].should.have.property('targetVersion', '1.0.0');
						products['example'].should.have.property('success', true);

						// Should not have called the first query
						database.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'example'", function(err, result) {
							result.rowCount.should.eql(0);

							done();
						});
					});
				});
			});
		});
	});
});

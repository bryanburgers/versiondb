var pg = require('pg');
var should = require('should');
var versiondb = require('../');

var db = process.env.DATABASE_URL;

function connect(callback) {
	pg.connect(db, callback);
}

function clear(database, callback) {
	database.query("DROP SCHEMA ver CASCADE", function(err) {
		// We might get an error that it does not exist. That's fine.
		return callback();
	});
}

function prep(callback) {
	connect(function(err, database, dbclose) {
		if (err) {
			dbclose();
			return callback(err, null, function() {});
		}

		clear(database, function(err) {
			if (err) {
				dbclose();
				return callback(err, null, function() {});
			}

			return callback(null, database, dbclose);
		});
	});
}

function prepWithVersionTable(callback) {
	prep(function(err, database, dbclose) {
		if (err) {
			dbclose();
			return callback(err, null, function() {});
		}

		versiondb.createVersionTable(database, function(err, data) {
			if (err) {
				dbclose();
				return callback(err, null, function() {});
			}

			return callback(null, database, dbclose);
		});
	});
}

describe('check', function() {
	it('identifies whether the ver schema exists', function(done) {
		prep(function(err, database, dbclose) {
			should.not.exist(err);

			versiondb.check(database, function(err, data) {
				should.not.exist(err);
				should.exist(data);
				data.should.have.property('exists', false);

				dbclose();
				done();
			});
		});
	});

	it('identifies whether the version table exists', function(done) {
		prep(function(err, database, dbclose) {
			should.not.exist(err);
			database.query('CREATE SCHEMA ver', function(err) {
				versiondb.check(database, function(err, data) {
					should.not.exist(err);
					should.exist(data);
					data.should.have.property('exists', false);

					dbclose();
					done();
				});
			});
		});
	});

	it('returns when there is no data', function(done) {
		prepWithVersionTable(function(err, database, dbclose) {
			should.not.exist(err);

			versiondb.check(database, function(err, data) {
				should.not.exist(err);
				should.exist(data);
				data.should.have.property('exists', true);
				data.should.have.property('products');
				data.products.should.eql([]);

				dbclose();
				done();
			});
		});
	});

	it('returns when there is data', function(done) {
		prepWithVersionTable(function(err, database, dbclose) {
			should.not.exist(err);

			database.query("INSERT INTO ver.version VALUES ('example', '1.0.1')", function(err) {
				should.not.exist(err);

				database.query("INSERT INTO ver.version VALUES ('other', '2.0.0')", function(err) {
					should.not.exist(err);

					versiondb.check(database, function(err, data) {
						should.not.exist(err);
						should.exist(data);
						data.should.have.property('exists', true);
						data.should.have.property('products');

						data.products.should.eql({
							'example': '1.0.1',
							'other': '2.0.0'
						});

						dbclose();
						done();
					});
				});
			});
		});
	});
});

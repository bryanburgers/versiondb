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

describe('check', function() {
	it('identifies whether the ver schema exists', function(done) {
		prep(function(err, database) {
			should.not.exist(err);

			versiondb.check(database, function(err, data) {
				should.not.exist(err);
				should.exist(data);
				data.should.have.property('exists', false);

				done();
			});
		});
	});

	it('identifies whether the version table exists', function(done) {
		prep(function(err, database) {
			should.not.exist(err);
			database.query('CREATE SCHEMA ver', function(err) {
				versiondb.check(database, function(err, data) {
					should.not.exist(err);
					should.exist(data);
					data.should.have.property('exists', false);

					done();
				});
			});
		});
	});

	it('returns when there is no data', function(done) {
		prepWithVersionTable(function(err, database) {
			should.not.exist(err);

			versiondb.check(database, function(err, data) {
				should.not.exist(err);
				should.exist(data);
				data.should.have.property('exists', true);
				data.should.have.property('products');
				data.products.should.eql([]);

				done();
			});
		});
	});

	it('returns when there is data', function(done) {
		prepWithVersionTable(function(err, database) {
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

						done();
					});
				});
			});
		});
	});
});

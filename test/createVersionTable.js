var pg = require('pg');
var should = require('should');
var versiondb = require('../');

var db = process.env.DATABASE_URL;

function connect(callback) {
	pg.connect(db, callback);
}

function clear(database, callback) {
	database.query("DROP SCHEMA versiondb CASCADE", function(err) {
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

describe('createVersionTable', function() {
	it('create a version table when no schema exists', function(done) {
		prep(function(err, database, dbclose) {
			should.not.exist(err);

			versiondb.createVersionTable(database, function(err, data) {
				should.not.exist(err);

				should.exist(data);
				data.should.have.property('schemaCreated', true);
				data.should.have.property('tableCreated', true);

				database.query('SELECT * FROM information_schema.tables WHERE table_schema = \'versiondb\' AND table_name = \'version\'', function(err, data) {

					data.rowCount.should.eql(1);

					dbclose();
					done();
				});
			});
		});
	});

	it('create a version table when the schema already exists', function(done) {
		prep(function(err, database, dbclose) {
			should.not.exist(err);

			database.query('CREATE SCHEMA versiondb', function(err, data) {
				should.not.exist(err);

				versiondb.createVersionTable(database, function(err, data) {
					should.not.exist(err);

					should.exist(data);
					data.should.have.property('schemaCreated', false);
					data.should.have.property('tableCreated', true);

					database.query('SELECT * FROM information_schema.tables WHERE table_schema = \'versiondb\' AND table_name = \'version\'', function(err, data) {

						data.rowCount.should.eql(1);

						dbclose();
						done();
					});
				});
			});
		});
	});

	it('do nothing when the table already exists', function(done) {
		prep(function(err, database, dbclose) {
			should.not.exist(err);

			versiondb.createVersionTable(database, function(err, data) {
				should.not.exist(err);

				versiondb.createVersionTable(database, function(err, data) {
					should.not.exist(err);
					should.exist(data);
					data.should.have.property('schemaCreated', false);
					data.should.have.property('tableCreated', false);

					dbclose();
					done();
				});
			});
		});
	});
});

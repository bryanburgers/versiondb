# Version DB

A library for maintaining the schema version of a database. For the corresponding command line utility, install [VersionDB CLI](http://github.com/bryanburgers/versiondb-cli).

[![Build Status](https://secure.travis-ci.org/bryanburgers/versiondb.png)](http://travis-ci.org/bryanburgers/versiondb)

## How it works

Version DB includes a single table in that target database that tracks which version of each product's database schema resides in the database. Every time it is run, it checks what version of a product's database schema is on the database, checks the schema file, and runs all of the scripts required to bring the database schema up to the latest version.

If a product does not exist in the database, all of the scripts will be run on the database to create a schema that is the latest version.

## Installation

    npm install versiondb

## Usage

To check what schemas are currently installed on a database

    var versiondb = require('versiondb');
    versiondb.check(connection, function(err, versions) {
        // versions == { 'productname': '1.0.2', 'otherproduct': '2.0.0' }
    });

To run upgrade scripts

    var versiondb = require('versiondb');
    var status = versiondb.upgrade(connection, bundle);
    status.on('complete', function(err) {
        // done
    });

## Bundles

Upgrading the database requires passing in a bundle. You must either pass in a bundle returned by [versiondb-bundle-file](https://github.com/bryanburgers/versiondb-bundle-file),  [versiondb-bundle-memory](https://github.com/bryanburgers/versiondb-bundle-memory), or an object that conforms to the bundle interface.

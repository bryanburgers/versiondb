# Version DB

A command line utility and underlying library that allows for maintaining the schema version of a database.

## How it works

Version DB includes a single table in that target database that tracks which version of each product's database schema resides in the database. Every time it is run, it checks what version of a product's database schema is on the database, checks the schema file, and runs all of the scripts required to bring the database schema up to the latest version.

If a product does not exist in the database, all of the scripts will be run on the database to create a schema that is the latest version.

## Installation

    npm install -g versiondb

## Usage

To check what schemas are currently installed on a database

    versiondb pg://user@password:localhost/database

To run upgrade scripts

    versiondb pg://user@password:localhost/database scripts.json

## JSON format

    {
    	"productname": {
    		"1.0.0": "createscript.sql",
    		"1.0.1": "upgradescript-1.0.1.sql",
    		"1.0.2": "fix-table.sql"
    	},
    	"otherproduct": {
    		"2.0.0": "createother.sql"
    	}
    }

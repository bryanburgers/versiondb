# Version DB

Version DB is a command line utility and underlying library that allows for maintaining the schema version of a database.

## Usage

To check what schemas are currently installed on a database

    versiondb pg://user@password:localhost/database

To potentially run upgrade scripts

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
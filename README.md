# Version DB

An tool for maintaining the versioned schemas in a postgresql database.

[![Build Status](https://secure.travis-ci.org/bryanburgers/versiondb.png)](http://travis-ci.org/bryanburgers/versiondb)

## How it works

Version DB creates a single table (`versiondb.version`) in the target database
that tracks which version of each product's database schema resides in the
database. Every time it is run, it checks what version of a product's database
schema is on the database, checks the schema file, and runs all of the scripts
required to bring the database schema up to the latest version.

If a product does not exist in the database, all of the scripts will be run on
the database to create a schema that is the latest version.


## Installation

    npm install -g versiondb

## Usage

To check what schemas are currently installed on a database

    versiondb ls

To run upgrade scripts for a product

    versiondb run path/to/my/awesome/product/schema.yaml


## Schema Files

Schema files are written in YAML.

```yaml
product: my-product

versions:
  1.0:
    - name: Create tables
      script: 1.0/tables.sql
    - name: Create functions
      script: 1.0/functions.sql
    - name: Create users
      script: 1.0/users.sql

  1.1:
    - name: Tables and functions that support the new wizbang feature
      script: 1.1/wizbang.sql
    - name: Tables and functions that support the new foobar feature
      script: 1.1/foobar.sql
```

The scripts are referenced relative the schema file. Versions are considered
ordered by the order that they are in the schema file. (E.g., `versiondb` does
not do semver ordering or alphabetical ordering. It considers one version to be
after another version if it appears lower in the schema file.)

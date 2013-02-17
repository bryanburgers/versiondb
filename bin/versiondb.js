#!/usr/bin/env node
"use strict";

var versiondb = require('../index.js');

var database = process.argv[2];
var file = process.argv[3];

versiondb.upgrade(database, file, function() {
	process.exit();
});

/* eslint "no-process-exit":off, "no-process-env":off */

'use strict';

if (process.env.DATABASE_URL) {
    process.exit(0);
}
else {
    console.error('Environment variable \'DATABASE_URL\' is not defined.');
    console.error('Try: DATABASE_URL="postgres://user:password@host/database" npm test');
    process.exit(1);
}

'use strict';

function inventory(conn) {
    return conn.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'versiondb' AND table_name = 'version'`)
        .then((result) => {
            if (result.rowCount === 0) {
                return { exists: false, products: null };
            }

            return conn.query('SELECT product, version FROM versiondb.version ORDER BY product ASC')
                .then((result) => {
                    const r = {};
                    for (const row of result.rows) {
                        r[row.product] = row.version;
                    }

                    return { exists: true, products: r };
                });
        });
}

module.exports = inventory;

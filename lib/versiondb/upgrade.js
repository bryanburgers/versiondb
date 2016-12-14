'use strict';

const initialize = require('./initialize');

function splitVersions(versions, versionName) {
    const before = [];
    let match = null;
    const after = [];
    for (const version of versions) {
        if (version.name === versionName) {
            match = version;
            continue;
        }

        if (!match) {
            before.push(version);
        }
        else {
            after.push(version);
        }
    }

    return [before, match, after];
}

function upgrade(conn, manifest, statusEmitter) {
    statusEmitter = statusEmitter || { emit: () => { /* Do nothing */ } };

    return initialize(conn)
        .then(() => currentVersion(conn, manifest))
        .then((currentVersion) => {
            let versions = [];
            const existingVersions = [];
            if (currentVersion === undefined) {
                versions = manifest.versions;
            }
            else {
                // Only run the versions AFTER the current version.
                const [before, match, after] = splitVersions(manifest.versions, currentVersion);
                existingVersions.push(...before, match);
                versions.push(...after);

                if (!match) {
                    statusEmitter.emit('incompatible', {
                        manifest,
                        currentVersion,
                    });

                    return {
                        result: 'incompatible',
                        initialVersion: currentVersion,
                        manifest: manifest,
                        currentVersion: null,
                        updatedVersions: [],
                        existingVersions: [],
                        pendingVersions: [],
                        failedVersion: null,
                        failedTask: null,
                        failedTaskScript: null,
                        error: null,
                    };
                }

                if (!versions.length) {
                    statusEmitter.emit('plan', {
                        manifest,
                        currentVersion,
                        targetVersion: currentVersion,
                        existingVersions,
                        versions: [],
                    });

                    return {
                        result: 'success',
                        initialVersion: currentVersion,
                        manifest: manifest,
                        currentVersion: existingVersions[existingVersions.length - 1],
                        updatedVersions: [],
                        existingVersions: existingVersions,
                        pendingVersions: [],
                        failedVersion: null,
                        failedTask: null,
                        failedTaskScript: null,
                        error: null,
                    };
                }
            }

            statusEmitter.emit('plan', {
                manifest,
                currentVersion,
                targetVersion: versions[versions.length - 1].name,
                existingVersions,
                versions,
            });

            return runVersions(conn, statusEmitter, manifest, versions).then(
                () => {
                    const res = {};
                    res.result = 'success';
                    res.initialVersion = currentVersion || null;
                    res.manifest = manifest;
                    res.currentVersion = versions[versions.length - 1];
                    res.updatedVersions = [res.currentVersion];
                    res.existingVersions = existingVersions;
                    res.pendingVersions = [];
                    res.failedVersion = null;
                    res.failedTask = null;
                    res.failedTaskScript = null;
                    res.error = null;

                    return res;
                },
                (err) => {
                    const [updatedVersions, match, pendingVersions] = splitVersions(versions, err.version.name);
                    pendingVersions.unshift(match);

                    const res = {};
                    res.result = 'error';
                    res.initialVersion = currentVersion || null;
                    res.manifest = manifest;
                    res.currentVersion = updatedVersions.length ? updatedVersions[updatedVersions.length - 1] : null;
                    res.updatedVersions = updatedVersions;
                    res.existingVersions = existingVersions;
                    res.pendingVersions = pendingVersions;
                    res.failedVersion = err.version;
                    res.failedTask = err.task;
                    res.failedTaskScript = err.script;
                    res.error = err;

                    return res;
                });
        });
}

function currentVersion(conn, manifest) {
    return conn.query('SELECT version FROM versiondb.version WHERE product = $1', [manifest.product])
        .then((result) => {
            if (result.rowCount === 0) {
                return;
            }

            return result.rows[0].version;
        });
}

function runVersions(conn, statusEmitter, manifest, versions, index = 0) {
    if (index >= versions.length) {
        return Promise.resolve();
    }

    const version = versions[index];

    return runVersion(conn, statusEmitter, manifest, version).then(() => runVersions(conn, statusEmitter, manifest, versions, index + 1));
}

function runVersion(conn, statusEmitter, manifest, version) {
    statusEmitter.emit('versionStart', {
        manifest,
        version,
    });

    const r = conn.query('BEGIN TRANSACTION')
        .then(() => runTasks(conn, statusEmitter, manifest, version, version.tasks).then(
            () => updateVersionInDatabase(conn, manifest, version).then(() => conn.query('COMMIT TRANSACTION')),
            (err) => conn.query('ROLLBACK TRANSACTION').then(() => { err.version = version; throw err; })
        ));

    return r.then(
        () => {
            statusEmitter.emit('versionEnd', {
                manifest,
                version,
                result: 'success',
            });

            return r;
        },
        (err) => {
            statusEmitter.emit('versionEnd', {
                manifest,
                version,
                result: 'error',
                error: err,
            });

            return r;
        }
    );
}

function updateVersionInDatabase(conn, manifest, version) {
    const query = `
        WITH upsert AS (
            UPDATE versiondb.version
            SET version = $2
            WHERE product = $1
            RETURNING *
        )
        INSERT INTO versiondb.version (product, version)
        SELECT $1, $2
        WHERE NOT EXISTS (SELECT * FROM upsert)
    `;

    return conn.query({
        text: query,
        name: 'upsert version',
        values: [manifest.product, version.name],
    });
}

function runTasks(conn, statusEmitter, manifest, version, tasks, index = 0) {
    if (index >= tasks.length) {
        return;
    }

    const task = tasks[index];

    return runTask(conn, statusEmitter, manifest, version, task).then(() => runTasks(conn, statusEmitter, manifest, version, tasks, index + 1));
}

function runTask(conn, statusEmitter, manifest, version, task) {
    return task.loadScript()
        .then((content) => {
            statusEmitter.emit('taskStart', {
                manifest,
                version,
                task,
                script: content,
            });

            return conn.query(content)
                .then(
                    (result) => {
                        statusEmitter.emit('taskEnd', {
                            manifest,
                            version,
                            task,
                            script: content,
                            result: 'success',
                            databaseResult: result,
                        });
                    },
                    (err) => {
                        err.task = task;
                        err.script = content;

                        statusEmitter.emit('taskEnd', {
                            manifest,
                            version,
                            task,
                            script: content,
                            result: 'error',
                            error: err,
                        });

                        return Promise.reject(err);
                    }
                );
        });
}

module.exports = upgrade;

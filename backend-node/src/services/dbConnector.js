const sqlite3 = require('sqlite3').verbose();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DATA_DIR = path.join(__dirname, '../../data');
const DEMO_DB = path.join(__dirname, '../../demo.sqlite');
const _userConnections = {};

const getUserDbPath = (userId) => {
    return path.join(DATA_DIR, `user_${userId}.sqlite`);
};

const ensureUserDb = (userId) => {
    const userDbPath = getUserDbPath(userId);
    if (!fs.existsSync(userDbPath)) {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        if (fs.existsSync(DEMO_DB)) {
            fs.copyFileSync(DEMO_DB, userDbPath);
        }
    }
    return userDbPath;
};

const connectSqlite = (userId, dbPath) => {
    return new Promise((resolve) => {
        try {
            const key = `sqlite_${userId}`;
            if (_userConnections[key]) {
                _userConnections[key].close();
            }

            const finalPath = dbPath || ensureUserDb(userId);
            const db = new sqlite3.Database(finalPath, (err) => {
                if (err) {
                    resolve({ status: "error", message: `Failed to connect to SQLite: ${err.message}` });
                } else {
                    _userConnections[key] = db;
                    _userConnections[`type_${userId}`] = "sqlite";
                    _userConnections[`path_${userId}`] = finalPath;
                    resolve({ status: "success", message: `Connected to SQLite database` });
                }
            });
        } catch (error) {
            resolve({ status: "error", message: `SQLite Error: ${error.message}` });
        }
    });
};

const connectPostgres = async (userId, dbUrl) => {
    try {
        const key = `pg_${userId}`;
        if (_userConnections[key]) {
            await _userConnections[key].end();
        }
        const client = new Client({ connectionString: dbUrl });
        await client.connect();

        _userConnections[key] = client;
        _userConnections[`type_${userId}`] = "postgres";

        let maskedUrl = "postgres://...";
        try {
            const urlParts = new URL(dbUrl);
            maskedUrl = `${urlParts.protocol}//${urlParts.username}:***@${urlParts.host}${urlParts.pathname}`;
        } catch (e) {}

        _userConnections[`path_${userId}`] = maskedUrl;
        return { status: "success", message: `Connected to PostgreSQL database` };
    } catch (error) {
        return { status: "error", message: `PostgreSQL Connection Failed: ${error.message}` };
    }
};

const autoConnect = async (userId) => {
    const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
    if (url && url.startsWith("postgres")) {
        return await connectPostgres(userId, url);
    } else {
        return await connectSqlite(userId);
    }
};

const getActiveDb = async (userId) => {
    const activeType = _userConnections[`type_${userId}`] || "sqlite";

    if (activeType === "postgres") {
        const key = `pg_${userId}`;
        if (!_userConnections[key]) await autoConnect(userId);
        return { type: "postgres", conn: _userConnections[key] };
    } else {
        const key = `sqlite_${userId}`;
        if (!_userConnections[key]) await autoConnect(userId);
        return { type: "sqlite", conn: _userConnections[key] };
    }
};

const executeQuery = (userId, sql) => {
    return new Promise(async (resolve) => {
        try {
            const { type, conn } = await getActiveDb(userId);

            if (type === "postgres") {
                const result = await conn.query(sql);
                resolve({
                    status: "success",
                    rows_returned: result.rows.length,
                    columns: result.fields ? result.fields.map(f => f.name) : [],
                    data: result.rows.slice(0, 100),
                    message: `Query executed successfully (${result.rowCount || result.rows.length} rows affected/returned)`
                });
            } else {
                const firstWord = sql.trim().toUpperCase().split(/\s+/)[0];
                if (firstWord === "SELECT" || firstWord === "PRAGMA") {
                    conn.all(sql, [], (err, rows) => {
                        if (err) resolve({ status: "error", error: err.message });
                        else {
                            const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
                            resolve({
                                status: "success",
                                rows_returned: rows.length,
                                columns,
                                data: rows.slice(0, 100),
                                message: `Query executed successfully (${rows.length} rows returned)`
                            });
                        }
                    });
                } else {
                    conn.run(sql, function(err) {
                        if (err) resolve({ status: "error", error: err.message });
                        else {
                            resolve({
                                status: "success",
                                rows_affected: this.changes,
                                message: `Query executed successfully (${this.changes} rows affected)`
                            });
                        }
                    });
                }
            }
        } catch (error) {
            resolve({ status: "error", error: error.message });
        }
    });
};

const getSchemaAsText = (userId) => {
    return new Promise(async (resolve) => {
        try {
            const { type, conn } = await getActiveDb(userId);
            let schemaText = "";

            if (type === "postgres") {
                const tableQuery = `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
                const tablesResult = await conn.query(tableQuery);
                const tables = tablesResult.rows.map(r => r.table_name);

                if (tables.length === 0) { resolve("No tables found."); return; }

                for (const table of tables) {
                    schemaText += `Table: ${table}\n`;
                    const colQuery = `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`;
                    const colsResult = await conn.query(colQuery, [table]);
                    for (const col of colsResult.rows) {
                        schemaText += `  - ${col.column_name} (${col.data_type})\n`;
                    }
                    schemaText += "\n";
                }
                resolve(schemaText.trim());
            } else {
                conn.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
                    if (err || tables.length === 0) { resolve("No tables found."); return; }

                    let tablesProcessed = 0;
                    for (const row of tables) {
                        const table = row.name;
                        schemaText += `Table: ${table}\n`;
                        conn.all(`PRAGMA table_info(${table})`, [], (err, cols) => {
                            if (!err) {
                                for (const col of cols) {
                                    schemaText += `  - ${col.name} (${col.type})\n`;
                                }
                            }
                            schemaText += "\n";
                            tablesProcessed++;
                            if (tablesProcessed === tables.length) {
                                resolve(schemaText.trim());
                            }
                        });
                    }
                });
            }
        } catch (error) {
            resolve(`Error fetching schema: ${error.message}`);
        }
    });
};

const getConnectionStatus = (userId) => {
    const activeType = _userConnections[`type_${userId}`] || "sqlite";
    const sqliteKey = `sqlite_${userId}`;
    const pgKey = `pg_${userId}`;
    return {
        connected: !!(_userConnections[sqliteKey] || _userConnections[pgKey]),
        type: activeType,
        path: _userConnections[`path_${userId}`] || "Not connected"
    };
};

module.exports = { connectSqlite, connectPostgres, autoConnect, executeQuery, getSchemaAsText, getConnectionStatus };

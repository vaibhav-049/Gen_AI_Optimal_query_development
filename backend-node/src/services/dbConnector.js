const sqlite3 = require('sqlite3').verbose();
const { Client } = require('pg');
require('dotenv').config();


const _connections = {};

const connectSqlite = (dbPath) => {
    return new Promise((resolve) => {
        try {
            if (_connections.sqlite) {
                _connections.sqlite.close();
            }
            const db = new sqlite3.Database(dbPath, (err) => {
                if (err) {
                    resolve({ status: "error", message: `Failed to connect to SQLite: ${err.message}` });
                } else {
                    _connections.sqlite = db;
                    _connections.active_type = "sqlite";
                    _connections.db_path = dbPath;
                    resolve({ status: "success", message: `Connected to SQLite database at ${dbPath}` });
                }
            });
        } catch (error) {
            resolve({ status: "error", message: `SQLite Error: ${error.message}` });
        }
    });
};

const connectPostgres = async (dbUrl) => {
    try {
        if (_connections.pg) {
            await _connections.pg.end();
        }
        const client = new Client({ connectionString: dbUrl });
        await client.connect();
        
        _connections.pg = client;
        _connections.active_type = "postgres";
        
        
        let maskedUrl = "postgres://...";
        try {
            const urlParts = new URL(dbUrl);
            maskedUrl = `${urlParts.protocol}//${urlParts.username}:***@${urlParts.host}${urlParts.pathname}`;
        } catch (e) {}

        _connections.db_path = maskedUrl;
        return { status: "success", message: `Connected to PostgreSQL database at ${maskedUrl}` };
    } catch (error) {
        return { status: "error", message: `PostgreSQL Connection Failed: ${error.message}` };
    }
};

const getActiveConnectionInfo = () => {
    const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
    if (url && url.startsWith("postgres")) {
        return { type: "postgres", url };
    }
    return { type: "sqlite", url: null };
};

const autoConnect = async () => {
    const info = getActiveConnectionInfo();
    if (info.type === "postgres") {
        return await connectPostgres(info.url);
    } else {
        return await connectSqlite("./demo.sqlite");
    }
};

const executeQuery = (sql) => {
    return new Promise(async (resolve) => {
        const info = getActiveConnectionInfo();
        const activeType = _connections.active_type || info.type;

        try {
            if (activeType === "postgres") {
                if (!_connections.pg) {
                    await autoConnect();
                }
                const client = _connections.pg;
                const result = await client.query(sql);
                
                resolve({
                    status: "success",
                    rows_returned: result.rows.length,
                    columns: result.fields ? result.fields.map(f => f.name) : [],
                    data: result.rows.slice(0, 100),
                    message: `Query executed successfully (${result.rowCount || result.rows.length} rows affected/returned)`
                });
            } else {
                if (!_connections.sqlite) {
                    await autoConnect();
                }
                const db = _connections.sqlite;
                
                
                const firstWord = sql.trim().toUpperCase().split(/\s+/)[0];
                if (firstWord === "SELECT" || firstWord === "PRAGMA") {
                    db.all(sql, [], (err, rows) => {
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
                    db.run(sql, function(err) {
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

const getSchemaAsText = () => {
    return new Promise(async (resolve) => {
        const info = getActiveConnectionInfo();
        const activeType = _connections.active_type || info.type;
        let schemaText = "";

        try {
            if (activeType === "postgres") {
                if (!_connections.pg) await autoConnect();
                const client = _connections.pg;
                
                const tableQuery = `
                    SELECT table_name 
                    FROM information_schema.tables 
                    WHERE table_schema = 'public'
                `;
                const tablesResult = await client.query(tableQuery);
                const tables = tablesResult.rows.map(r => r.table_name);
                
                if (tables.length === 0) {
                    resolve("No tables found in public schema.");
                    return;
                }

                for (const table of tables) {
                    schemaText += `Table: ${table}\n`;
                    const colQuery = `
                        SELECT column_name, data_type 
                        FROM information_schema.columns 
                        WHERE table_name = $1 AND table_schema = 'public'
                    `;
                    const colsResult = await client.query(colQuery, [table]);
                    for (const col of colsResult.rows) {
                        schemaText += `  - ${col.column_name} (${col.data_type})\n`;
                    }
                    schemaText += "\n";
                }
                resolve(schemaText.trim());
            } else {
                if (!_connections.sqlite) await autoConnect();
                const db = _connections.sqlite;
                
                db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
                    if (err || tables.length === 0) {
                        resolve("No tables found.");
                        return;
                    }
                    
                    let tablesProcessed = 0;
                    for (const row of tables) {
                        const table = row.name;
                        schemaText += `Table: ${table}\n`;
                        db.all(`PRAGMA table_info(${table})`, [], (err, cols) => {
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

const getConnectionStatus = () => {
    const info = getActiveConnectionInfo();
    const activeType = _connections.active_type || info.type;
    return {
        connected: !!(_connections.sqlite || _connections.pg),
        type: activeType,
        path: _connections.db_path || (activeType === "sqlite" ? "./demo.sqlite" : "PostgreSQL")
    };
};

module.exports = {
    connectSqlite,
    connectPostgres,
    autoConnect,
    executeQuery,
    getSchemaAsText,
    getConnectionStatus
};

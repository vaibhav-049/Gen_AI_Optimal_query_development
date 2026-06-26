const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/users.sqlite');
let db = null;

const getDb = () => {
    if (db) return db;
    db = new sqlite3.Database(DB_PATH);
    db.run("PRAGMA journal_mode=WAL");
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        tokens_used_today INTEGER DEFAULT 0,
        token_cap INTEGER DEFAULT 50000,
        last_token_reset TEXT DEFAULT (date('now')),
        created_at TEXT DEFAULT (datetime('now')),
        last_login TEXT
    )`);
    return db;
};

const createUser = (email, passwordHash) => {
    return new Promise((resolve, reject) => {
        const d = getDb();
        d.run(
            "INSERT INTO users (email, password_hash) VALUES (?, ?)",
            [email, passwordHash],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) {
                        reject(new Error('EMAIL_EXISTS'));
                    } else {
                        reject(err);
                    }
                } else {
                    resolve({ id: this.lastID, email });
                }
            }
        );
    });
};

const findUserByEmail = (email) => {
    return new Promise((resolve, reject) => {
        const d = getDb();
        d.get("SELECT * FROM users WHERE email = ?", [email], (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
        });
    });
};

const findUserById = (id) => {
    return new Promise((resolve, reject) => {
        const d = getDb();
        d.get("SELECT id, email, tokens_used_today, token_cap, created_at, last_login FROM users WHERE id = ?", [id], (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
        });
    });
};

const updateLastLogin = (id) => {
    const d = getDb();
    d.run("UPDATE users SET last_login = datetime('now') WHERE id = ?", [id]);
};

const addTokenUsage = (userId, tokensUsed) => {
    return new Promise((resolve, reject) => {
        const d = getDb();
        d.get("SELECT tokens_used_today, token_cap, last_token_reset FROM users WHERE id = ?", [userId], (err, row) => {
            if (err) return reject(err);
            if (!row) return reject(new Error('User not found'));

            const today = new Date().toISOString().split('T')[0];
            let currentUsage = row.tokens_used_today;

            if (row.last_token_reset !== today) {
                currentUsage = 0;
                d.run("UPDATE users SET tokens_used_today = 0, last_token_reset = ? WHERE id = ?", [today, userId]);
            }

            const newUsage = currentUsage + tokensUsed;
            d.run("UPDATE users SET tokens_used_today = ? WHERE id = ?", [newUsage, userId]);
            resolve({ tokens_used_today: newUsage, token_cap: row.token_cap, remaining: row.token_cap - newUsage });
        });
    });
};

const checkTokenCap = (userId) => {
    return new Promise((resolve, reject) => {
        const d = getDb();
        d.get("SELECT tokens_used_today, token_cap, last_token_reset FROM users WHERE id = ?", [userId], (err, row) => {
            if (err) return reject(err);
            if (!row) return reject(new Error('User not found'));

            const today = new Date().toISOString().split('T')[0];
            let currentUsage = row.tokens_used_today;

            if (row.last_token_reset !== today) {
                currentUsage = 0;
            }

            resolve({
                allowed: currentUsage < row.token_cap,
                tokens_used_today: currentUsage,
                token_cap: row.token_cap,
                remaining: row.token_cap - currentUsage
            });
        });
    });
};

module.exports = { createUser, findUserByEmail, findUserById, updateLastLogin, addTokenUsage, checkTokenCap };

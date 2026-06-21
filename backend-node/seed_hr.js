const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'demo.sqlite');
const sqlFilePath = path.join(__dirname, '..', 'employee (1).sql');


if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
}

const db = new sqlite3.Database(dbPath);

let sqlScript = fs.readFileSync(sqlFilePath, 'utf8');


sqlScript = sqlScript.replace(/INT\s*\(\d+\)/gi, 'INTEGER');
sqlScript = sqlScript.replace(/INTEGER\s*AUTO_INCREMENT\s*PRIMARY\s*KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');
sqlScript = sqlScript.replace(/AUTO_INCREMENT/gi, 'AUTOINCREMENT');


const statements = sqlScript.split(';').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('use') && !s.startsWith('create database'));

db.serialize(() => {
    db.run("PRAGMA foreign_keys = ON;");
    
    for (const stmt of statements) {
        db.run(stmt, (err) => {
            if (err) {
                console.error("Error executing statement:", stmt.substring(0, 50) + "...");
                console.error(err.message);
            }
        });
    }
});

console.log("HR Database seeded successfully.");
db.close();

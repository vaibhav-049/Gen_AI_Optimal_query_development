const dbConnector = require('../services/dbConnector');

exports.dbConnect = async (req, res) => {
    try {
        const { db_path = "./demo.sqlite", db_type = "sqlite" } = req.body;
        
        let result;
        if (db_type === "postgres" || db_path.startsWith("postgres")) {
            result = await dbConnector.connectPostgres(db_path);
        } else {
            result = await dbConnector.connectSqlite(db_path);
        }
        res.json(result);
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

exports.dbSchema = async (req, res) => {
    try {
        const schemaText = await dbConnector.getSchemaAsText();
        const status = dbConnector.getConnectionStatus();
        res.json({ schema_text: schemaText, ...status });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

exports.dbStatus = async (req, res) => {
    try {
        const status = dbConnector.getConnectionStatus();
        res.json(status);
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

const dbConnector = require('../services/dbConnector');

exports.dbConnect = async (req, res) => {
    try {
        const userId = req.user.id;
        const { db_path, db_type = "sqlite" } = req.body;

        let result;
        if (db_type === "postgres" || (db_path && db_path.startsWith("postgres"))) {
            result = await dbConnector.connectPostgres(userId, db_path);
        } else {
            result = await dbConnector.connectSqlite(userId, db_path);
        }
        res.json(result);
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

exports.dbSchema = async (req, res) => {
    try {
        const userId = req.user.id;
        const schemaText = await dbConnector.getSchemaAsText(userId);
        const status = dbConnector.getConnectionStatus(userId);
        res.json({ schema_text: schemaText, ...status });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

exports.dbStatus = async (req, res) => {
    try {
        const userId = req.user.id;
        const status = dbConnector.getConnectionStatus(userId);
        res.json(status);
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

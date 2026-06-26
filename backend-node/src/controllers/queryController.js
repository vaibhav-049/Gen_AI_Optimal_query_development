const llmRouter = require('../services/llmRouter');
const sqlParser = require('../services/sqlParser');
const codeQuality = require('../services/codeQuality');
const dbConnector = require('../services/dbConnector');

exports.chat = async (req, res) => {
    try {
        const userId = req.user.id;
        const { message, history = [] } = req.body;
        const schema = await dbConnector.getSchemaAsText(userId);
        const response = await llmRouter.route('chat', [message, history, schema], userId);
        res.json({ response, status: "success" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.analyzeSql = async (req, res) => {
    try {
        const userId = req.user.id;
        const { sql, schema: reqSchema } = req.body;
        if (!sql || !sql.trim()) return res.status(400).json({ detail: "SQL cannot be empty" });

        const schema = reqSchema || await dbConnector.getSchemaAsText(userId);
        const classification = sqlParser.classifyQuery(sql);
        const complexity = sqlParser.estimateTimeComplexity(sql);
        const rows = sqlParser.estimateRowsAffected(sql);
        const tablesInfo = sqlParser.extractTablesAndColumns(sql);
        const quality = codeQuality.calculateCodeQuality(sql);
        const aiExplanation = await llmRouter.route('explainSimple', [sql], userId);

        res.json({
            status: "success", sql, classification, complexity,
            rows_affected: rows, tables_info: tablesInfo, quality,
            ai_explanation: aiExplanation
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.nlpToSqlEndpoint = async (req, res) => {
    try {
        const userId = req.user.id;
        const { requirement, schema: reqSchema } = req.body;
        const schema = reqSchema || await dbConnector.getSchemaAsText(userId);
        const result = await llmRouter.route('nlpToSql', [requirement, schema], userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.suggestQuery = async (req, res) => {
    try {
        const userId = req.user.id;
        const { requirement, schema: reqSchema } = req.body;
        const schema = reqSchema || await dbConnector.getSchemaAsText(userId);
        const result = await llmRouter.route('suggestBestQuery', [requirement, schema], userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.explainSimpleEndpoint = async (req, res) => {
    try {
        const userId = req.user.id;
        const { sql } = req.body;
        if (!sql || !sql.trim()) return res.status(400).json({ detail: "SQL cannot be empty" });
        const explanation = await llmRouter.route('explainSimple', [sql], userId);
        res.json({ explanation, status: "success" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.optimizeSql = async (req, res) => {
    try {
        const userId = req.user.id;
        const { sql, schema: reqSchema } = req.body;
        if (!sql || !sql.trim()) return res.status(400).json({ detail: "SQL cannot be empty" });
        const schema = reqSchema || await dbConnector.getSchemaAsText(userId);

        const classification = sqlParser.classifyQuery(sql);
        const complexity = sqlParser.estimateTimeComplexity(sql);
        const quality = codeQuality.calculateCodeQuality(sql);
        const aiOptimization = await llmRouter.route('optimizeQuery', [sql, schema], userId);

        res.json({ status: "success", sql, classification, complexity, quality, ai_optimization: aiOptimization });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.codeQualityEndpoint = async (req, res) => {
    try {
        const { sql } = req.body;
        if (!sql || !sql.trim()) return res.status(400).json({ detail: "SQL cannot be empty" });
        const result = codeQuality.calculateCodeQuality(sql);
        res.json({ status: "success", ...result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.classifySql = async (req, res) => {
    try {
        const { sql } = req.body;
        const result = sqlParser.classifyQuery(sql);
        res.json({ status: "success", ...result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.tablesInfo = async (req, res) => {
    try {
        const { sql } = req.body;
        const result = sqlParser.extractTablesAndColumns(sql);
        res.json({ status: "success", ...result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.industryStandard = async (req, res) => {
    try {
        const userId = req.user.id;
        const { requirement, schema: reqSchema } = req.body;
        const schema = reqSchema || await dbConnector.getSchemaAsText(userId);
        const result = await llmRouter.route('generateIndustryStandardSql', [requirement, schema], userId);
        res.json({ response: result, status: "success" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.executeSql = async (req, res) => {
    try {
        const userId = req.user.id;
        const { sql } = req.body;
        const result = await dbConnector.executeQuery(userId, sql);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

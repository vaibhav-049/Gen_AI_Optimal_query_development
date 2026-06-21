const MAX_SQL_LENGTH = 10000;
const MAX_REQ_LENGTH = 2000;

exports.validateApiKey = (req, res, next) => {
    const expectedKey = process.env.CLIENT_API_KEY;
    if (!expectedKey) return next(); 

    const providedKey = req.headers['x-api-key'] || req.query.api_key;
    if (!providedKey || providedKey !== expectedKey) {
        return res.status(401).json({ status: "error", message: "Unauthorized: Invalid or missing API Key" });
    }
    next();
};


exports.validateQueryRequest = (req, res, next) => {
    const allowedFields = ['sql', 'schema'];
    const keys = Object.keys(req.body);

    for (let key of keys) {
        if (!allowedFields.includes(key)) {
            return res.status(400).json({ status: "error", message: `Unexpected field: ${key}` });
        }
    }

    if (req.body.sql) {
        if (typeof req.body.sql !== 'string') {
            return res.status(400).json({ status: "error", message: "SQL must be a string." });
        }
        if (req.body.sql.length > MAX_SQL_LENGTH) {
            return res.status(400).json({ status: "error", message: `SQL query exceeds maximum length of ${MAX_SQL_LENGTH} characters.` });
        }
    }

    if (req.body.schema) {
        if (typeof req.body.schema !== 'string') {
            return res.status(400).json({ status: "error", message: "Schema must be a string." });
        }
        if (req.body.schema.length > MAX_SQL_LENGTH) {
            return res.status(400).json({ status: "error", message: "Schema definition is too large." });
        }
    }

    next();
};

exports.validateNLPRequest = (req, res, next) => {
    const allowedFields = ['requirement', 'schema'];
    const keys = Object.keys(req.body);

    for (let key of keys) {
        if (!allowedFields.includes(key)) {
            return res.status(400).json({ status: "error", message: `Unexpected field: ${key}` });
        }
    }

    if (!req.body.requirement || typeof req.body.requirement !== 'string') {
        return res.status(400).json({ status: "error", message: "Requirement is mandatory and must be a string." });
    }

    if (req.body.requirement.length > MAX_REQ_LENGTH) {
        return res.status(400).json({ status: "error", message: `Requirement exceeds maximum length of ${MAX_REQ_LENGTH} characters.` });
    }

    if (req.body.schema) {
        if (typeof req.body.schema !== 'string') {
            return res.status(400).json({ status: "error", message: "Schema must be a string." });
        }
        if (req.body.schema.length > MAX_SQL_LENGTH) {
            return res.status(400).json({ status: "error", message: "Schema definition is too large." });
        }
    }

    next();
};

exports.validateChatRequest = (req, res, next) => {
    const allowedFields = ['message', 'history'];
    const keys = Object.keys(req.body);

    for (let key of keys) {
        if (!allowedFields.includes(key)) {
            return res.status(400).json({ status: "error", message: `Unexpected field: ${key}` });
        }
    }

    if (!req.body.message || typeof req.body.message !== 'string') {
        return res.status(400).json({ status: "error", message: "Message is mandatory and must be a string." });
    }

    if (req.body.message.length > MAX_REQ_LENGTH) {
        return res.status(400).json({ status: "error", message: "Message is too large." });
    }

    if (req.body.history) {
        if (!Array.isArray(req.body.history)) {
            return res.status(400).json({ status: "error", message: "History must be an array." });
        }
        if (req.body.history.length > 50) {
            return res.status(400).json({ status: "error", message: "Chat history too long." });
        }
    }

    next();
};

exports.validateDbConnectRequest = (req, res, next) => {
    const allowedFields = ['db_path', 'db_type'];
    const keys = Object.keys(req.body);

    for (let key of keys) {
        if (!allowedFields.includes(key)) {
            return res.status(400).json({ status: "error", message: `Unexpected field: ${key}` });
        }
    }

    next();
};

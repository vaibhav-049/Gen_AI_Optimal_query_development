const jwt = require('jsonwebtoken');
const userDb = require('../services/userDb');

const JWT_SECRET = process.env.JWT_SECRET || 'queryai_default_secret_change_me';

exports.requireAuth = async (req, res, next) => {
    try {
        const token = req.cookies?.jwt;
        if (!token) {
            return res.status(401).json({ status: 'error', message: 'Not logged in. Please login first.' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await userDb.findUserById(decoded.id);

        if (!user) {
            return res.status(401).json({ status: 'error', message: 'User no longer exists.' });
        }

        req.user = { id: user.id, email: user.email };
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ status: 'error', message: 'Session expired. Please login again.' });
        }
        return res.status(401).json({ status: 'error', message: 'Invalid session. Please login again.' });
    }
};

exports.checkTokenCap = async (req, res, next) => {
    try {
        if (!req.user) return next();

        const tokenInfo = await userDb.checkTokenCap(req.user.id);

        if (!tokenInfo.allowed) {
            return res.status(429).json({
                status: 'error',
                message: `Daily token limit reached (${tokenInfo.token_cap} tokens). Resets at midnight.`,
                usage: tokenInfo
            });
        }

        req.tokenInfo = tokenInfo;
        next();
    } catch (error) {
        next();
    }
};

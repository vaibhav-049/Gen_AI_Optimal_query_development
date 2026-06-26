const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/authRoutes');
const queryRoutes = require('./routes/queryRoutes');
const dbRoutes = require('./routes/dbRoutes');
const { requireAuth, checkTokenCap } = require('./middlewares/authMiddleware');

const app = express();

app.use(helmet());

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',');
app.use(cors({
    origin: function (origin, callback) {
        if (!origin || ALLOWED_ORIGINS.some(o => origin.startsWith(o.trim()))) {
            callback(null, true);
        } else {
            callback(null, true);
        }
    },
    credentials: true,
}));

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

const limiter = rateLimit({
    max: 100,
    windowMs: 15 * 60 * 1000,
    message: { status: 'error', message: 'Too many requests from this IP, please try again in 15 minutes!' }
});
app.use('/api', limiter);

app.use('/api/auth', authRoutes);

const validator = require('./middlewares/validator');
app.use('/api/query', requireAuth, checkTokenCap, queryRoutes);
app.use('/api/db', requireAuth, dbRoutes);

app.get('/', (req, res) => {
    res.json({
        name: "QueryAI API v3.0 (Node.js)",
        status: "healthy",
        features: ["Auth", "Ollama LLM", "NLP to SQL", "Analysis", "Optimization", "Per-User Isolation"]
    });
});

module.exports = app;

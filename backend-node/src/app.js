const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const queryRoutes = require('./routes/queryRoutes');
const dbRoutes = require('./routes/dbRoutes');

const app = express();



app.use(helmet());


app.use(cors({
    origin: function (origin, callback) {
        callback(null, true);
    },
    credentials: true,
}));


app.use(express.json({ limit: '100kb' }));


const limiter = rateLimit({
    max: 100,
    windowMs: 15 * 60 * 1000,
    message: 'Too many requests from this IP, please try again in 15 minutes!'
});
app.use('/api', limiter);


const validator = require('./middlewares/validator');
app.use('/api', validator.validateApiKey);
app.use('/api/query', queryRoutes);
app.use('/api/db', dbRoutes);


app.get('/', (req, res) => {
    res.json({
        name: "QueryAI API v2.0 (Node.js)",
        status: "healthy",
        features: ["NLP to SQL", "Analysis", "Optimization"]
    });
});

module.exports = app;

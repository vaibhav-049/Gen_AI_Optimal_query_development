const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middlewares/authMiddleware');
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
    max: 5,
    windowMs: 2 * 60 * 1000,
    message: { status: 'error', message: 'Too many login attempts. Please try again in 2 minutes.' }
});

router.post('/signup', authLimiter, authController.signup);
router.post('/login', authLimiter, authController.login);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);

module.exports = router;

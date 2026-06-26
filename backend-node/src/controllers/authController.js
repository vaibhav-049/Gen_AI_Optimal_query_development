const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userDb = require('../services/userDb');

const JWT_SECRET = process.env.JWT_SECRET || 'queryai_default_secret_change_me';
const JWT_EXPIRES = '24h';
const SALT_ROUNDS = 12;

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const signToken = (userId) => {
    return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
};

const setCookie = (res, token) => {
    res.cookie('jwt', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    });
};

exports.signup = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ status: 'error', message: 'Email and password are required.' });
        }

        if (!EMAIL_REGEX.test(email)) {
            return res.status(400).json({ status: 'error', message: 'Invalid email format.' });
        }

        if (!PASSWORD_REGEX.test(password)) {
            return res.status(400).json({
                status: 'error',
                message: 'Password must be at least 8 characters with 1 uppercase letter, 1 lowercase letter, and 1 number.'
            });
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const user = await userDb.createUser(email.toLowerCase().trim(), passwordHash);

        const token = signToken(user.id);
        setCookie(res, token);

        res.status(201).json({ status: 'success', user: { id: user.id, email: user.email } });
    } catch (error) {
        if (error.message === 'EMAIL_EXISTS') {
            return res.status(409).json({ status: 'error', message: 'An account with this email already exists.' });
        }
        res.status(500).json({ status: 'error', message: 'Something went wrong. Please try again.' });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ status: 'error', message: 'Email and password are required.' });
        }

        const user = await userDb.findUserByEmail(email.toLowerCase().trim());

        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ status: 'error', message: 'Invalid credentials.' });
        }

        userDb.updateLastLogin(user.id);
        const token = signToken(user.id);
        setCookie(res, token);

        res.json({ status: 'success', user: { id: user.id, email: user.email } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Something went wrong. Please try again.' });
    }
};

exports.logout = (req, res) => {
    res.cookie('jwt', '', { httpOnly: true, expires: new Date(0) });
    res.json({ status: 'success', message: 'Logged out.' });
};

exports.me = async (req, res) => {
    try {
        const user = await userDb.findUserById(req.user.id);
        if (!user) {
            return res.status(404).json({ status: 'error', message: 'User not found.' });
        }

        const tokenInfo = await userDb.checkTokenCap(req.user.id);
        res.json({
            status: 'success',
            user: {
                id: user.id,
                email: user.email,
                created_at: user.created_at,
                last_login: user.last_login
            },
            usage: tokenInfo
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Something went wrong.' });
    }
};

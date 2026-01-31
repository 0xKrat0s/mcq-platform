const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Generate a secure session secret or use environment variable
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// Admin panel path - change this to something unique and hard to guess
const ADMIN_PATH = process.env.ADMIN_PATH || '/manage-x7k9p';

// Rate limiting for login attempts
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes

function rateLimiter(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const attempts = loginAttempts.get(ip);

    if (attempts) {
        // Clean up old attempts
        attempts.timestamps = attempts.timestamps.filter(t => now - t < LOCKOUT_TIME);

        if (attempts.timestamps.length >= MAX_ATTEMPTS) {
            const oldestAttempt = attempts.timestamps[0];
            const remainingTime = Math.ceil((LOCKOUT_TIME - (now - oldestAttempt)) / 1000 / 60);
            return res.status(429).json({
                success: false,
                message: `Too many login attempts. Please try again in ${remainingTime} minutes.`
            });
        }
    }
    next();
}

function recordLoginAttempt(ip) {
    const now = Date.now();
    if (!loginAttempts.has(ip)) {
        loginAttempts.set(ip, { timestamps: [] });
    }
    loginAttempts.get(ip).timestamps.push(now);
}

function clearLoginAttempts(ip) {
    loginAttempts.delete(ip);
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: 'sid', // Don't use default 'connect.sid'
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'strict'
    }
}));

// Home page - redirect to user exam entry
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Export rate limiting functions for use in routes
app.locals.rateLimiter = rateLimiter;
app.locals.recordLoginAttempt = recordLoginAttempt;
app.locals.clearLoginAttempts = clearLoginAttempts;
app.locals.ADMIN_PATH = ADMIN_PATH;

// Initialize database and start server
async function startServer() {
    try {
        // Initialize database first
        const db = require('./database/db');
        await db.initialize();

        // Routes (loaded after DB is initialized)
        const adminRoutes = require('./routes/admin');
        const examRoutes = require('./routes/exam');
        const apiRoutes = require('./routes/api');

        // Use the obfuscated admin path
        app.use(ADMIN_PATH, adminRoutes);
        app.use('/exam', examRoutes);
        app.use('/api', apiRoutes);

        // Redirect old /admin path to 404 (security through obscurity)
        app.use('/admin', (req, res) => {
            res.status(404).send('Not Found');
        });

        app.listen(PORT, () => {
            console.log(`\n========================================`);
            console.log(`  MCQ Exam Platform is running!`);
            console.log(`========================================`);
            console.log(`  User Portal:  http://localhost:${PORT}`);
            console.log(`  Admin Panel:  http://localhost:${PORT}${ADMIN_PATH}`);
            console.log(`========================================\n`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

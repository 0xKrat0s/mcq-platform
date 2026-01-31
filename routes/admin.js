const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const path = require('path');

// Get admin path dynamically
function getAdminPath(req) {
    return req.app.locals.ADMIN_PATH || '/manage-x7k9p';
}

// Middleware to check admin authentication
function requireAdmin(req, res, next) {
    if (req.session && req.session.adminId) {
        next();
    } else {
        res.redirect(getAdminPath(req) + '/login');
    }
}

// Redirect root to dashboard or login
router.get('/', (req, res) => {
    const adminPath = getAdminPath(req);
    if (req.session && req.session.adminId) {
        res.redirect(adminPath + '/dashboard');
    } else {
        res.redirect(adminPath + '/login');
    }
});

// Admin login page
router.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'admin', 'login.html'));
});

// Admin login POST with rate limiting
router.post('/login', (req, res, next) => {
    // Apply rate limiting
    const rateLimiter = req.app.locals.rateLimiter;
    if (rateLimiter) {
        rateLimiter(req, res, next);
    } else {
        next();
    }
}, (req, res) => {
    const { username, password } = req.body;
    const ip = req.ip || req.connection.remoteAddress;
    const adminPath = getAdminPath(req);

    const admin = db.get('SELECT * FROM admins WHERE username = ?', [username]);

    if (admin && bcrypt.compareSync(password, admin.password)) {
        // Clear failed attempts on successful login
        if (req.app.locals.clearLoginAttempts) {
            req.app.locals.clearLoginAttempts(ip);
        }
        req.session.adminId = admin.id;
        req.session.adminUsername = admin.username;
        res.json({ success: true, redirect: adminPath + '/dashboard' });
    } else {
        // Record failed attempt
        if (req.app.locals.recordLoginAttempt) {
            req.app.locals.recordLoginAttempt(ip);
        }
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// Admin logout
router.get('/logout', (req, res) => {
    const adminPath = getAdminPath(req);
    req.session.destroy();
    res.redirect(adminPath + '/login');
});

// Admin dashboard
router.get('/dashboard', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'admin', 'dashboard.html'));
});

// Exam management page
router.get('/exams', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'admin', 'exams.html'));
});

// Questions management page
router.get('/questions/:examId', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'admin', 'questions.html'));
});

// Results page
router.get('/results', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'admin', 'results.html'));
});

// Results for specific exam
router.get('/results/:examId', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'admin', 'exam-results.html'));
});

// Candidate detail view
router.get('/candidate/:candidateId', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'admin', 'candidate-detail.html'));
});

// Change password page
router.get('/settings', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'admin', 'settings.html'));
});

// Change password POST
router.post('/change-password', requireAdmin, (req, res) => {
    const { currentPassword, newPassword } = req.body;

    const admin = db.get('SELECT * FROM admins WHERE id = ?', [req.session.adminId]);

    if (!bcrypt.compareSync(currentPassword, admin.password)) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    db.run('UPDATE admins SET password = ? WHERE id = ?', [hashedPassword, req.session.adminId]);

    res.json({ success: true, message: 'Password changed successfully' });
});

module.exports = router;

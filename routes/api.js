const express = require('express');
const router = express.Router();
const db = require('../database/db');
const path = require('path');
const fs = require('fs');

// Use /tmp for Vercel serverless, local path for development
const isVercel = process.env.VERCEL === '1';
const UPLOAD_DIR = isVercel
    ? path.join('/tmp', 'uploads')
    : path.join(__dirname, '..', 'public', 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Middleware to check admin authentication for API
function requireAdmin(req, res, next) {
    if (req.session && req.session.adminId) {
        next();
    } else {
        res.status(401).json({ success: false, message: 'Unauthorized' });
    }
}

// ==================== IMAGE UPLOAD API ====================

// Upload image (base64)
router.post('/upload-image', requireAdmin, (req, res) => {
    try {
        const { image } = req.body;

        if (!image) {
            return res.status(400).json({ success: false, message: 'No image provided' });
        }

        // Extract base64 data and mime type
        const matches = image.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
        if (!matches) {
            return res.status(400).json({ success: false, message: 'Invalid image format' });
        }

        const extension = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        const base64Data = matches[2];

        // Generate unique filename
        const filename = `img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${extension}`;
        const filepath = path.join(UPLOAD_DIR, filename);

        // Write file
        fs.writeFileSync(filepath, base64Data, 'base64');

        // Return URL
        res.json({
            success: true,
            url: `/uploads/${filename}`
        });
    } catch (error) {
        console.error('Image upload error:', error);
        res.status(500).json({ success: false, message: 'Failed to upload image' });
    }
});

// ==================== EXAM APIs ====================

// Get all exams
router.get('/exams', requireAdmin, (req, res) => {
    const exams = db.all(`
        SELECT e.*,
               (SELECT COUNT(*) FROM questions WHERE exam_id = e.id) as question_count,
               (SELECT COUNT(*) FROM candidates WHERE exam_id = e.id AND is_submitted = 1) as submission_count
        FROM exams e
        ORDER BY e.created_at DESC
    `);
    res.json(exams);
});

// Get single exam
router.get('/exams/:id', requireAdmin, (req, res) => {
    const exam = db.get('SELECT * FROM exams WHERE id = ?', [req.params.id]);
    if (exam) {
        res.json(exam);
    } else {
        res.status(404).json({ success: false, message: 'Exam not found' });
    }
});

// Create exam
router.post('/exams', requireAdmin, (req, res) => {
    const {
        title, exam_code, description, duration_minutes,
        marks_per_question, negative_marking, result_mode,
        allow_back_navigation, shuffle_questions, prevent_duplicate_attempts
    } = req.body;

    try {
        const result = db.run(`
            INSERT INTO exams (title, exam_code, description, duration_minutes,
                              marks_per_question, negative_marking, result_mode,
                              allow_back_navigation, shuffle_questions, prevent_duplicate_attempts)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            title, exam_code.toUpperCase(), description, duration_minutes || 30,
            marks_per_question || 1, negative_marking || 0, result_mode || 'admin_only',
            allow_back_navigation ? 1 : 0, shuffle_questions ? 1 : 0, prevent_duplicate_attempts ? 1 : 0
        ]);

        res.json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
        if (error.message && error.message.includes('UNIQUE')) {
            res.status(400).json({ success: false, message: 'Exam code already exists' });
        } else {
            res.status(500).json({ success: false, message: error.message });
        }
    }
});

// Update exam
router.put('/exams/:id', requireAdmin, (req, res) => {
    const {
        title, exam_code, description, duration_minutes,
        marks_per_question, negative_marking, result_mode,
        allow_back_navigation, shuffle_questions, prevent_duplicate_attempts, is_active
    } = req.body;

    try {
        db.run(`
            UPDATE exams SET
                title = ?, exam_code = ?, description = ?, duration_minutes = ?,
                marks_per_question = ?, negative_marking = ?, result_mode = ?,
                allow_back_navigation = ?, shuffle_questions = ?, prevent_duplicate_attempts = ?,
                is_active = ?
            WHERE id = ?
        `, [
            title, exam_code.toUpperCase(), description, duration_minutes,
            marks_per_question, negative_marking, result_mode,
            allow_back_navigation ? 1 : 0, shuffle_questions ? 1 : 0, prevent_duplicate_attempts ? 1 : 0,
            is_active ? 1 : 0, req.params.id
        ]);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete exam
router.delete('/exams/:id', requireAdmin, (req, res) => {
    try {
        // Delete related data first (manual cascade for sql.js)
        const questions = db.all('SELECT id FROM questions WHERE exam_id = ?', [req.params.id]);
        questions.forEach(q => {
            db.run('DELETE FROM responses WHERE question_id = ?', [q.id]);
        });
        db.run('DELETE FROM questions WHERE exam_id = ?', [req.params.id]);
        db.run('DELETE FROM candidates WHERE exam_id = ?', [req.params.id]);
        db.run('DELETE FROM exams WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Toggle exam active status
router.post('/exams/:id/toggle-active', requireAdmin, (req, res) => {
    const exam = db.get('SELECT is_active FROM exams WHERE id = ?', [req.params.id]);
    if (exam) {
        db.run('UPDATE exams SET is_active = ? WHERE id = ?', [exam.is_active ? 0 : 1, req.params.id]);
        res.json({ success: true, is_active: !exam.is_active });
    } else {
        res.status(404).json({ success: false, message: 'Exam not found' });
    }
});

// Publish results
router.post('/exams/:id/publish-results', requireAdmin, (req, res) => {
    db.run('UPDATE exams SET results_published = 1 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
});

// Unpublish results
router.post('/exams/:id/unpublish-results', requireAdmin, (req, res) => {
    db.run('UPDATE exams SET results_published = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
});

// ==================== QUESTION APIs ====================

// Get questions for an exam
router.get('/exams/:examId/questions', requireAdmin, (req, res) => {
    const questions = db.all(`
        SELECT * FROM questions WHERE exam_id = ? ORDER BY question_order, id
    `, [req.params.examId]);
    res.json(questions);
});

// Add question
router.post('/exams/:examId/questions', requireAdmin, (req, res) => {
    const { question_text, option_a, option_b, option_c, option_d, correct_option, marks } = req.body;

    // Get next order
    const lastQuestion = db.get('SELECT MAX(question_order) as max_order FROM questions WHERE exam_id = ?', [req.params.examId]);
    const nextOrder = (lastQuestion?.max_order || 0) + 1;

    try {
        const result = db.run(`
            INSERT INTO questions (exam_id, question_text, option_a, option_b, option_c, option_d, correct_option, marks, question_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [req.params.examId, question_text, option_a, option_b, option_c, option_d, correct_option.toUpperCase(), marks || 1, nextOrder]);

        res.json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update question
router.put('/questions/:id', requireAdmin, (req, res) => {
    const { question_text, option_a, option_b, option_c, option_d, correct_option, marks } = req.body;

    try {
        db.run(`
            UPDATE questions SET
                question_text = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?,
                correct_option = ?, marks = ?
            WHERE id = ?
        `, [question_text, option_a, option_b, option_c, option_d, correct_option.toUpperCase(), marks, req.params.id]);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete question
router.delete('/questions/:id', requireAdmin, (req, res) => {
    try {
        db.run('DELETE FROM responses WHERE question_id = ?', [req.params.id]);
        db.run('DELETE FROM questions WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== RESULTS APIs ====================

// Get all candidates for an exam
router.get('/exams/:examId/candidates', requireAdmin, (req, res) => {
    const candidates = db.all(`
        SELECT c.*,
               (SELECT COUNT(*) FROM responses WHERE candidate_id = c.id) as questions_answered
        FROM candidates c
        WHERE c.exam_id = ?
        ORDER BY c.score DESC, c.end_time ASC
    `, [req.params.examId]);
    res.json(candidates);
});

// Get candidate details with responses
router.get('/candidates/:id', requireAdmin, (req, res) => {
    const candidate = db.get(`
        SELECT c.*, e.title as exam_title, e.exam_code
        FROM candidates c
        JOIN exams e ON c.exam_id = e.id
        WHERE c.id = ?
    `, [req.params.id]);

    if (!candidate) {
        return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    const responses = db.all(`
        SELECT r.*, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option, q.marks
        FROM responses r
        JOIN questions q ON r.question_id = q.id
        WHERE r.candidate_id = ?
        ORDER BY q.question_order, q.id
    `, [req.params.id]);

    res.json({ candidate, responses });
});

// Delete candidate
router.delete('/candidates/:id', requireAdmin, (req, res) => {
    try {
        db.run('DELETE FROM responses WHERE candidate_id = ?', [req.params.id]);
        db.run('DELETE FROM candidates WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Export results as CSV
router.get('/exams/:examId/export', requireAdmin, (req, res) => {
    const exam = db.get('SELECT * FROM exams WHERE id = ?', [req.params.examId]);
    const candidates = db.all(`
        SELECT name, email, score, total_marks, start_time, end_time, is_submitted
        FROM candidates
        WHERE exam_id = ? AND is_submitted = 1
        ORDER BY score DESC
    `, [req.params.examId]);

    let csv = 'Rank,Name,Email,Score,Total Marks,Percentage,Start Time,End Time\n';
    candidates.forEach((c, index) => {
        const percentage = c.total_marks > 0 ? ((c.score / c.total_marks) * 100).toFixed(2) : 0;
        csv += `${index + 1},"${c.name}","${c.email}",${c.score},${c.total_marks},${percentage}%,${c.start_time},${c.end_time}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${exam.exam_code}-results.csv"`);
    res.send(csv);
});

// ==================== SITE SETTINGS APIs ====================

// Get site settings (public - for landing page)
router.get('/site-settings', (req, res) => {
    const settings = db.get('SELECT * FROM site_settings WHERE id = 1');
    res.json(settings || {});
});

// Update site settings (admin only)
router.put('/site-settings', requireAdmin, (req, res) => {
    const {
        portal_title,
        portal_subtitle,
        company_name,
        company_logo,
        company_website,
        institute_name,
        institute_logo,
        footer_text
    } = req.body;

    try {
        db.run(`
            UPDATE site_settings SET
                portal_title = ?,
                portal_subtitle = ?,
                company_name = ?,
                company_logo = ?,
                company_website = ?,
                institute_name = ?,
                institute_logo = ?,
                footer_text = ?,
                updated_at = datetime('now')
            WHERE id = 1
        `, [
            portal_title || 'Exam Portal',
            portal_subtitle || 'Enter your details to begin',
            company_name || null,
            company_logo || null,
            company_website || null,
            institute_name || null,
            institute_logo || null,
            footer_text || null
        ]);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Dashboard stats
router.get('/dashboard/stats', requireAdmin, (req, res) => {
    const totalExams = db.get('SELECT COUNT(*) as count FROM exams')?.count || 0;
    const activeExams = db.get('SELECT COUNT(*) as count FROM exams WHERE is_active = 1')?.count || 0;
    const totalQuestions = db.get('SELECT COUNT(*) as count FROM questions')?.count || 0;
    const totalSubmissions = db.get('SELECT COUNT(*) as count FROM candidates WHERE is_submitted = 1')?.count || 0;

    const recentExams = db.all(`
        SELECT e.*,
               (SELECT COUNT(*) FROM candidates WHERE exam_id = e.id AND is_submitted = 1) as submissions
        FROM exams e
        ORDER BY e.created_at DESC
        LIMIT 5
    `);

    res.json({
        totalExams,
        activeExams,
        totalQuestions,
        totalSubmissions,
        recentExams
    });
});

module.exports = router;

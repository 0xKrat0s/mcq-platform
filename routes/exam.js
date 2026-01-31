const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { v4: uuidv4 } = require('uuid');

// Start exam - validate and create session
router.post('/start', (req, res) => {
    try {
        const { name, email, exam_code } = req.body;

        if (!name || !email || !exam_code) {
            return res.status(400).json({ success: false, message: 'Name, email and exam code are required' });
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, message: 'Please enter a valid email address' });
        }

        // Find exam
        const exam = db.get('SELECT * FROM exams WHERE exam_code = ? AND is_active = 1', [exam_code.toUpperCase()]);

    if (!exam) {
        return res.status(404).json({ success: false, message: 'Invalid exam code or exam is not active' });
    }

    // Check for duplicate attempts if enabled (using email as unique identifier)
    if (exam.prevent_duplicate_attempts) {
        const existingCandidate = db.get(`
            SELECT * FROM candidates WHERE exam_id = ? AND email = ? AND is_submitted = 1
        `, [exam.id, email.trim().toLowerCase()]);

        if (existingCandidate) {
            return res.status(400).json({
                success: false,
                message: 'You have already taken this exam'
            });
        }
    }

    // Check if there's an ongoing session
    const ongoingSession = db.get(`
        SELECT * FROM candidates WHERE exam_id = ? AND email = ? AND is_submitted = 0
    `, [exam.id, email.trim().toLowerCase()]);

    let candidate;
    let sessionToken;

    if (ongoingSession) {
        // Resume existing session
        candidate = ongoingSession;
        sessionToken = ongoingSession.session_token;
    } else {
        // Create new candidate session
        sessionToken = uuidv4();
        const totalMarks = db.get('SELECT SUM(marks) as total FROM questions WHERE exam_id = ?', [exam.id])?.total || 0;

        db.run(`
            INSERT INTO candidates (name, email, exam_id, session_token, start_time, total_marks)
            VALUES (?, ?, ?, ?, datetime('now'), ?)
        `, [name.trim(), email.trim().toLowerCase(), exam.id, sessionToken, totalMarks]);

        // Retrieve the candidate by session token (more reliable than lastInsertRowid)
        candidate = db.get('SELECT * FROM candidates WHERE session_token = ?', [sessionToken]);
    }

    if (!candidate) {
        return res.status(500).json({ success: false, message: 'Failed to create session. Please try again.' });
    }

    // Store in session
    req.session.candidateId = candidate.id;
    req.session.sessionToken = sessionToken;

    res.json({
        success: true,
        sessionToken,
        examTitle: exam.title,
        examCode: exam.exam_code,
        duration: exam.duration_minutes,
        allowBackNavigation: exam.allow_back_navigation,
        resultMode: exam.result_mode,
        startTime: candidate.start_time
    });
    } catch (error) {
        console.error('Error starting exam:', error);
        res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
});

// Get questions for the exam
router.get('/questions', (req, res) => {
    try {
        const candidateId = req.session.candidateId;

        if (!candidateId) {
            return res.status(401).json({ success: false, message: 'Session expired. Please start again.' });
        }

    const candidate = db.get(`
        SELECT c.*, e.shuffle_questions, e.duration_minutes, e.allow_back_navigation
        FROM candidates c
        JOIN exams e ON c.exam_id = e.id
        WHERE c.id = ?
    `, [candidateId]);

    if (!candidate) {
        return res.status(404).json({ success: false, message: 'Session not found' });
    }

    if (candidate.is_submitted) {
        return res.status(400).json({ success: false, message: 'Exam already submitted' });
    }

    // Get questions (without correct answers)
    let questions = db.all(`
        SELECT id, question_text, option_a, option_b, option_c, option_d, marks, question_order
        FROM questions
        WHERE exam_id = ?
        ORDER BY question_order, id
    `, [candidate.exam_id]);

    // Shuffle if enabled
    if (candidate.shuffle_questions) {
        questions = shuffleArray(questions);
    }

    // Get existing responses
    const responses = db.all(`
        SELECT question_id, selected_option FROM responses WHERE candidate_id = ?
    `, [candidateId]);

    const responseMap = {};
    responses.forEach(r => {
        responseMap[r.question_id] = r.selected_option;
    });

    // Calculate remaining time
    const startTime = new Date(candidate.start_time + 'Z');
    const now = new Date();
    const elapsedSeconds = Math.floor((now - startTime) / 1000);
    const totalSeconds = candidate.duration_minutes * 60;
    const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);

    res.json({
        questions,
        responses: responseMap,
        remainingSeconds,
        allowBackNavigation: candidate.allow_back_navigation
    });
    } catch (error) {
        console.error('Error getting questions:', error);
        res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
});

// Save answer
router.post('/answer', (req, res) => {
    try {
        const candidateId = req.session.candidateId;
        const { questionId, selectedOption } = req.body;

        if (!candidateId) {
            return res.status(401).json({ success: false, message: 'Session expired' });
        }

    const candidate = db.get('SELECT * FROM candidates WHERE id = ? AND is_submitted = 0', [candidateId]);

    if (!candidate) {
        return res.status(400).json({ success: false, message: 'Invalid session or exam already submitted' });
    }

    // Verify question belongs to this exam
    const question = db.get('SELECT * FROM questions WHERE id = ? AND exam_id = ?', [questionId, candidate.exam_id]);

    if (!question) {
        return res.status(400).json({ success: false, message: 'Invalid question' });
    }

    // Get exam for negative marking
    const exam = db.get('SELECT * FROM exams WHERE id = ?', [candidate.exam_id]);

    // Check if answer is correct
    const isCorrect = selectedOption && selectedOption.toUpperCase() === question.correct_option;
    let marksObtained = 0;

    if (selectedOption) {
        if (isCorrect) {
            marksObtained = question.marks;
        } else if (exam.negative_marking > 0) {
            marksObtained = -exam.negative_marking;
        }
    }

    // Check if response exists
    const existingResponse = db.get('SELECT id FROM responses WHERE candidate_id = ? AND question_id = ?', [candidateId, questionId]);

    if (existingResponse) {
        db.run(`
            UPDATE responses SET selected_option = ?, is_correct = ?, marks_obtained = ?, answered_at = datetime('now')
            WHERE candidate_id = ? AND question_id = ?
        `, [selectedOption || null, isCorrect ? 1 : 0, marksObtained, candidateId, questionId]);
    } else {
        db.run(`
            INSERT INTO responses (candidate_id, question_id, selected_option, is_correct, marks_obtained)
            VALUES (?, ?, ?, ?, ?)
        `, [candidateId, questionId, selectedOption || null, isCorrect ? 1 : 0, marksObtained]);
    }

    res.json({ success: true });
    } catch (error) {
        console.error('Error saving answer:', error);
        res.status(500).json({ success: false, message: 'Failed to save answer' });
    }
});

// Submit exam
router.post('/submit', (req, res) => {
    try {
        const candidateId = req.session.candidateId;

        if (!candidateId) {
            return res.status(401).json({ success: false, message: 'Session expired' });
        }

    const candidate = db.get('SELECT * FROM candidates WHERE id = ? AND is_submitted = 0', [candidateId]);

    if (!candidate) {
        return res.status(400).json({ success: false, message: 'Invalid session or exam already submitted' });
    }

    // Calculate final score
    const scoreResult = db.get(`
        SELECT COALESCE(SUM(marks_obtained), 0) as total_score
        FROM responses
        WHERE candidate_id = ?
    `, [candidateId]);

    const score = Math.max(0, scoreResult?.total_score || 0); // Don't allow negative total

    // Update candidate
    db.run(`
        UPDATE candidates
        SET is_submitted = 1, end_time = datetime('now'), score = ?
        WHERE id = ?
    `, [score, candidateId]);

    // Clear session
    req.session.candidateId = null;
    req.session.sessionToken = null;

    res.json({
        success: true,
        message: 'Exam submitted successfully'
    });
    } catch (error) {
        console.error('Error submitting exam:', error);
        res.status(500).json({ success: false, message: 'Failed to submit exam' });
    }
});

// Check result (for user viewing their score)
router.get('/result/:sessionToken', (req, res) => {
    const candidate = db.get(`
        SELECT c.*, e.title as exam_title, e.result_mode, e.results_published
        FROM candidates c
        JOIN exams e ON c.exam_id = e.id
        WHERE c.session_token = ?
    `, [req.params.sessionToken]);

    if (!candidate) {
        return res.status(404).json({ success: false, message: 'Result not found' });
    }

    if (!candidate.is_submitted) {
        return res.status(400).json({ success: false, message: 'Exam not yet submitted' });
    }

    // Check if user can see result based on result_mode
    let canViewResult = false;
    let message = '';

    switch (candidate.result_mode) {
        case 'private':
            canViewResult = true;
            break;
        case 'public':
            canViewResult = true;
            break;
        case 'after_publish':
            canViewResult = candidate.results_published === 1;
            if (!canViewResult) {
                message = 'Results will be published by the administrator';
            }
            break;
        case 'admin_only':
        default:
            canViewResult = false;
            message = 'Results are only visible to the administrator';
            break;
    }

    if (canViewResult) {
        res.json({
            success: true,
            canView: true,
            name: candidate.name,
            examTitle: candidate.exam_title,
            score: candidate.score,
            totalMarks: candidate.total_marks,
            percentage: candidate.total_marks > 0 ? ((candidate.score / candidate.total_marks) * 100).toFixed(2) : 0
        });
    } else {
        res.json({
            success: true,
            canView: false,
            message
        });
    }
});

// Get leaderboard (for public result mode)
router.get('/leaderboard/:examCode', (req, res) => {
    const exam = db.get(`
        SELECT * FROM exams WHERE exam_code = ?
    `, [req.params.examCode.toUpperCase()]);

    if (!exam) {
        return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    if (exam.result_mode !== 'public' && !(exam.result_mode === 'after_publish' && exam.results_published)) {
        return res.status(403).json({ success: false, message: 'Leaderboard not available for this exam' });
    }

    const leaderboard = db.all(`
        SELECT name, score, total_marks, end_time
        FROM candidates
        WHERE exam_id = ? AND is_submitted = 1
        ORDER BY score DESC, end_time ASC
    `, [exam.id]);

    res.json({
        success: true,
        examTitle: exam.title,
        leaderboard: leaderboard.map((c, index) => ({
            rank: index + 1,
            name: c.name,
            score: c.score,
            totalMarks: c.total_marks,
            percentage: c.total_marks > 0 ? ((c.score / c.total_marks) * 100).toFixed(2) : 0
        }))
    });
});

// Helper function to shuffle array
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

module.exports = router;

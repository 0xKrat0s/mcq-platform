// localStorage abstraction layer for the MCQ Exam Platform

const STORAGE_KEYS = {
    EXAMS: 'mcq_exams',
    QUESTIONS: 'mcq_questions',
    CANDIDATES: 'mcq_candidates',
    RESPONSES: 'mcq_responses',
    SETTINGS: 'mcq_settings',
    ADMINS: 'mcq_admins',
    COUNTERS: 'mcq_counters'
};

class MCQStorage {
    constructor() {
        this.initializeDefaults();
    }

    // Initialize default data if not exists
    initializeDefaults() {
        // Initialize counters for auto-increment IDs
        if (!localStorage.getItem(STORAGE_KEYS.COUNTERS)) {
            localStorage.setItem(STORAGE_KEYS.COUNTERS, JSON.stringify({
                exams: 0,
                questions: 0,
                candidates: 0,
                responses: 0,
                admins: 1
            }));
        }

        // Initialize settings
        if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
            localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({
                portal_title: 'Exam Portal',
                portal_subtitle: 'Enter your details to begin',
                company_name: '',
                company_logo: '',
                company_website: '',
                institute_name: '',
                institute_logo: '',
                footer_text: ''
            }));
        }

        // Initialize empty arrays
        if (!localStorage.getItem(STORAGE_KEYS.EXAMS)) {
            localStorage.setItem(STORAGE_KEYS.EXAMS, JSON.stringify([]));
        }
        if (!localStorage.getItem(STORAGE_KEYS.QUESTIONS)) {
            localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify([]));
        }
        if (!localStorage.getItem(STORAGE_KEYS.CANDIDATES)) {
            localStorage.setItem(STORAGE_KEYS.CANDIDATES, JSON.stringify([]));
        }
        if (!localStorage.getItem(STORAGE_KEYS.RESPONSES)) {
            localStorage.setItem(STORAGE_KEYS.RESPONSES, JSON.stringify([]));
        }

        // Initialize default admin if not exists
        if (!localStorage.getItem(STORAGE_KEYS.ADMINS)) {
            // Default admin will be created on first auth check
            localStorage.setItem(STORAGE_KEYS.ADMINS, JSON.stringify([]));
        }
    }

    // Get next ID for a collection
    getNextId(collection) {
        const counters = JSON.parse(localStorage.getItem(STORAGE_KEYS.COUNTERS));
        counters[collection] = (counters[collection] || 0) + 1;
        localStorage.setItem(STORAGE_KEYS.COUNTERS, JSON.stringify(counters));
        return counters[collection];
    }

    // Generic CRUD operations

    getAll(key) {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    }

    getById(key, id) {
        const items = this.getAll(key);
        return items.find(item => item.id === id) || null;
    }

    create(key, item, collection) {
        const items = this.getAll(key);
        item.id = this.getNextId(collection);
        item.created_at = MCQUtils.getCurrentTimestamp();
        items.push(item);
        localStorage.setItem(key, JSON.stringify(items));
        return item;
    }

    update(key, id, updates) {
        const items = this.getAll(key);
        const index = items.findIndex(item => item.id === id);
        if (index !== -1) {
            items[index] = { ...items[index], ...updates };
            localStorage.setItem(key, JSON.stringify(items));
            return items[index];
        }
        return null;
    }

    delete(key, id) {
        const items = this.getAll(key);
        const filtered = items.filter(item => item.id !== id);
        localStorage.setItem(key, JSON.stringify(filtered));
        return filtered.length < items.length;
    }

    // Exam operations

    getAllExams() {
        return this.getAll(STORAGE_KEYS.EXAMS);
    }

    getExamById(id) {
        return this.getById(STORAGE_KEYS.EXAMS, id);
    }

    getExamByCode(code) {
        const exams = this.getAllExams();
        return exams.find(e => e.exam_code === code.toUpperCase()) || null;
    }

    createExam(exam) {
        exam.exam_code = exam.exam_code.toUpperCase();
        exam.is_active = exam.is_active !== false ? 1 : 0;
        exam.results_published = 0;
        return this.create(STORAGE_KEYS.EXAMS, exam, 'exams');
    }

    updateExam(id, updates) {
        if (updates.exam_code) {
            updates.exam_code = updates.exam_code.toUpperCase();
        }
        return this.update(STORAGE_KEYS.EXAMS, id, updates);
    }

    deleteExam(id) {
        // Also delete related questions, candidates, and responses
        const questions = this.getQuestionsByExamId(id);
        questions.forEach(q => this.deleteQuestion(q.id));

        const candidates = this.getCandidatesByExamId(id);
        candidates.forEach(c => this.deleteCandidate(c.id));

        return this.delete(STORAGE_KEYS.EXAMS, id);
    }

    // Question operations

    getAllQuestions() {
        return this.getAll(STORAGE_KEYS.QUESTIONS);
    }

    getQuestionById(id) {
        return this.getById(STORAGE_KEYS.QUESTIONS, id);
    }

    getQuestionsByExamId(examId) {
        const questions = this.getAllQuestions();
        return questions
            .filter(q => q.exam_id === examId)
            .sort((a, b) => (a.question_order || 0) - (b.question_order || 0));
    }

    createQuestion(question) {
        question.correct_option = question.correct_option.toUpperCase();
        // Get next order number
        const examQuestions = this.getQuestionsByExamId(question.exam_id);
        question.question_order = examQuestions.length + 1;
        return this.create(STORAGE_KEYS.QUESTIONS, question, 'questions');
    }

    updateQuestion(id, updates) {
        if (updates.correct_option) {
            updates.correct_option = updates.correct_option.toUpperCase();
        }
        return this.update(STORAGE_KEYS.QUESTIONS, id, updates);
    }

    deleteQuestion(id) {
        // Also delete related responses
        const responses = this.getAll(STORAGE_KEYS.RESPONSES);
        const filtered = responses.filter(r => r.question_id !== id);
        localStorage.setItem(STORAGE_KEYS.RESPONSES, JSON.stringify(filtered));

        return this.delete(STORAGE_KEYS.QUESTIONS, id);
    }

    // Candidate operations

    getAllCandidates() {
        return this.getAll(STORAGE_KEYS.CANDIDATES);
    }

    getCandidateById(id) {
        return this.getById(STORAGE_KEYS.CANDIDATES, id);
    }

    getCandidateBySessionToken(token) {
        const candidates = this.getAllCandidates();
        return candidates.find(c => c.session_token === token) || null;
    }

    getCandidatesByExamId(examId) {
        const candidates = this.getAllCandidates();
        return candidates.filter(c => c.exam_id === examId);
    }

    getCandidateByEmailAndExam(email, examId) {
        const candidates = this.getAllCandidates();
        return candidates.find(c =>
            c.email.toLowerCase() === email.toLowerCase() && c.exam_id === examId
        ) || null;
    }

    createCandidate(candidate) {
        candidate.email = candidate.email.toLowerCase();
        candidate.is_submitted = 0;
        candidate.session_token = MCQUtils.generateUUID();
        candidate.start_time = MCQUtils.getCurrentTimestamp();
        return this.create(STORAGE_KEYS.CANDIDATES, candidate, 'candidates');
    }

    updateCandidate(id, updates) {
        return this.update(STORAGE_KEYS.CANDIDATES, id, updates);
    }

    deleteCandidate(id) {
        // Also delete related responses
        const responses = this.getAll(STORAGE_KEYS.RESPONSES);
        const filtered = responses.filter(r => r.candidate_id !== id);
        localStorage.setItem(STORAGE_KEYS.RESPONSES, JSON.stringify(filtered));

        return this.delete(STORAGE_KEYS.CANDIDATES, id);
    }

    // Response operations

    getAllResponses() {
        return this.getAll(STORAGE_KEYS.RESPONSES);
    }

    getResponsesByCandidateId(candidateId) {
        const responses = this.getAllResponses();
        return responses.filter(r => r.candidate_id === candidateId);
    }

    getResponse(candidateId, questionId) {
        const responses = this.getAllResponses();
        return responses.find(r =>
            r.candidate_id === candidateId && r.question_id === questionId
        ) || null;
    }

    saveResponse(candidateId, questionId, selectedOption, isCorrect, marksObtained) {
        const responses = this.getAllResponses();
        const existingIndex = responses.findIndex(r =>
            r.candidate_id === candidateId && r.question_id === questionId
        );

        const response = {
            candidate_id: candidateId,
            question_id: questionId,
            selected_option: selectedOption,
            is_correct: isCorrect ? 1 : 0,
            marks_obtained: marksObtained,
            answered_at: MCQUtils.getCurrentTimestamp()
        };

        if (existingIndex !== -1) {
            responses[existingIndex] = { ...responses[existingIndex], ...response };
        } else {
            response.id = this.getNextId('responses');
            responses.push(response);
        }

        localStorage.setItem(STORAGE_KEYS.RESPONSES, JSON.stringify(responses));
        return response;
    }

    // Settings operations

    getSettings() {
        const settings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        return settings ? JSON.parse(settings) : {};
    }

    updateSettings(updates) {
        const settings = this.getSettings();
        const newSettings = { ...settings, ...updates, updated_at: MCQUtils.getCurrentTimestamp() };
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(newSettings));
        return newSettings;
    }

    // Admin operations

    getAllAdmins() {
        return this.getAll(STORAGE_KEYS.ADMINS);
    }

    getAdminByUsername(username) {
        const admins = this.getAllAdmins();
        return admins.find(a => a.username === username) || null;
    }

    createAdmin(admin) {
        return this.create(STORAGE_KEYS.ADMINS, admin, 'admins');
    }

    updateAdmin(id, updates) {
        return this.update(STORAGE_KEYS.ADMINS, id, updates);
    }

    // Statistics helpers

    getExamWithStats(examId) {
        const exam = this.getExamById(examId);
        if (!exam) return null;

        const questions = this.getQuestionsByExamId(examId);
        const candidates = this.getCandidatesByExamId(examId);
        const submittedCandidates = candidates.filter(c => c.is_submitted);

        return {
            ...exam,
            question_count: questions.length,
            submission_count: submittedCandidates.length
        };
    }

    getAllExamsWithStats() {
        const exams = this.getAllExams();
        return exams.map(exam => {
            const questions = this.getQuestionsByExamId(exam.id);
            const candidates = this.getCandidatesByExamId(exam.id);
            const submittedCandidates = candidates.filter(c => c.is_submitted);

            return {
                ...exam,
                question_count: questions.length,
                submission_count: submittedCandidates.length
            };
        });
    }

    // Clear all data (for testing)
    clearAll() {
        Object.values(STORAGE_KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
        this.initializeDefaults();
    }
}

// Export singleton instance
window.storage = new MCQStorage();

// API replacement layer for the MCQ Exam Platform
// This module provides the same interface as the server API but uses localStorage

const api = {
    // ==================== EXAM APIs ====================

    // Get all exams with stats
    getExams() {
        return storage.getAllExamsWithStats();
    },

    // Get single exam
    getExam(id) {
        return storage.getExamById(id);
    },

    // Get exam by code
    getExamByCode(code) {
        return storage.getExamByCode(code);
    },

    // Create exam
    createExam(data) {
        // Check if exam code already exists
        const existing = storage.getExamByCode(data.exam_code);
        if (existing) {
            return { success: false, message: 'Exam code already exists' };
        }

        const exam = storage.createExam({
            title: data.title,
            exam_code: data.exam_code,
            description: data.description || '',
            duration_minutes: data.duration_minutes || 30,
            marks_per_question: data.marks_per_question || 1,
            negative_marking: data.negative_marking || 0,
            result_mode: data.result_mode || 'admin_only',
            allow_back_navigation: data.allow_back_navigation ? 1 : 0,
            shuffle_questions: data.shuffle_questions ? 1 : 0,
            prevent_duplicate_attempts: data.prevent_duplicate_attempts ? 1 : 0,
            is_active: 1,
            results_published: 0
        });

        return { success: true, id: exam.id };
    },

    // Update exam
    updateExam(id, data) {
        // Check if exam code already exists (for different exam)
        if (data.exam_code) {
            const existing = storage.getExamByCode(data.exam_code);
            if (existing && existing.id !== id) {
                return { success: false, message: 'Exam code already exists' };
            }
        }

        storage.updateExam(id, {
            title: data.title,
            exam_code: data.exam_code,
            description: data.description,
            duration_minutes: data.duration_minutes,
            marks_per_question: data.marks_per_question,
            negative_marking: data.negative_marking,
            result_mode: data.result_mode,
            allow_back_navigation: data.allow_back_navigation ? 1 : 0,
            shuffle_questions: data.shuffle_questions ? 1 : 0,
            prevent_duplicate_attempts: data.prevent_duplicate_attempts ? 1 : 0,
            is_active: data.is_active ? 1 : 0
        });

        return { success: true };
    },

    // Delete exam
    deleteExam(id) {
        storage.deleteExam(id);
        return { success: true };
    },

    // Toggle exam active status
    toggleExamActive(id) {
        const exam = storage.getExamById(id);
        if (exam) {
            storage.updateExam(id, { is_active: exam.is_active ? 0 : 1 });
            return { success: true, is_active: !exam.is_active };
        }
        return { success: false, message: 'Exam not found' };
    },

    // Publish results
    publishResults(examId) {
        storage.updateExam(examId, { results_published: 1 });
        return { success: true };
    },

    // Unpublish results
    unpublishResults(examId) {
        storage.updateExam(examId, { results_published: 0 });
        return { success: true };
    },

    // ==================== QUESTION APIs ====================

    // Get questions for an exam
    getQuestions(examId) {
        return storage.getQuestionsByExamId(examId);
    },

    // Add question
    addQuestion(examId, data) {
        const question = storage.createQuestion({
            exam_id: examId,
            question_text: data.question_text,
            option_a: data.option_a,
            option_b: data.option_b,
            option_c: data.option_c,
            option_d: data.option_d,
            correct_option: data.correct_option,
            marks: data.marks || 1
        });

        return { success: true, id: question.id };
    },

    // Update question
    updateQuestion(id, data) {
        storage.updateQuestion(id, {
            question_text: data.question_text,
            option_a: data.option_a,
            option_b: data.option_b,
            option_c: data.option_c,
            option_d: data.option_d,
            correct_option: data.correct_option,
            marks: data.marks
        });

        return { success: true };
    },

    // Delete question
    deleteQuestion(id) {
        storage.deleteQuestion(id);
        return { success: true };
    },

    // ==================== EXAM FLOW APIs ====================

    // Start exam
    startExam(name, email, examCode) {
        if (!name || !email || !examCode) {
            return { success: false, message: 'Name, email and exam code are required' };
        }

        if (!MCQUtils.isValidEmail(email)) {
            return { success: false, message: 'Please enter a valid email address' };
        }

        const exam = storage.getExamByCode(examCode);
        if (!exam || !exam.is_active) {
            return { success: false, message: 'Invalid exam code or exam is not active' };
        }

        // Check for duplicate attempts
        if (exam.prevent_duplicate_attempts) {
            const existingCandidate = storage.getCandidateByEmailAndExam(email, exam.id);
            if (existingCandidate && existingCandidate.is_submitted) {
                return { success: false, message: 'You have already taken this exam' };
            }
        }

        // Check for ongoing session
        let candidate = storage.getCandidateByEmailAndExam(email, exam.id);

        if (candidate && !candidate.is_submitted) {
            // Resume existing session
        } else {
            // Calculate total marks for the exam
            const questions = storage.getQuestionsByExamId(exam.id);
            const totalMarks = questions.reduce((sum, q) => sum + (q.marks || 1), 0);

            // Create new candidate
            candidate = storage.createCandidate({
                name: name.trim(),
                email: email.trim(),
                exam_id: exam.id,
                total_marks: totalMarks,
                score: 0
            });
        }

        return {
            success: true,
            sessionToken: candidate.session_token,
            examTitle: exam.title,
            examCode: exam.exam_code,
            duration: exam.duration_minutes,
            allowBackNavigation: exam.allow_back_navigation,
            resultMode: exam.result_mode,
            startTime: candidate.start_time
        };
    },

    // Get exam questions for candidate
    getExamQuestions(sessionToken) {
        const candidate = storage.getCandidateBySessionToken(sessionToken);
        if (!candidate) {
            return { success: false, message: 'Session expired. Please start again.' };
        }

        if (candidate.is_submitted) {
            return { success: false, message: 'Exam already submitted' };
        }

        const exam = storage.getExamById(candidate.exam_id);
        if (!exam) {
            return { success: false, message: 'Exam not found' };
        }

        // Get questions (without correct answers for display)
        let questions = storage.getQuestionsByExamId(candidate.exam_id);

        // Shuffle if enabled
        if (exam.shuffle_questions) {
            questions = MCQUtils.shuffleArray(questions);
        }

        // Map questions to remove correct answers
        const questionsForDisplay = questions.map(q => ({
            id: q.id,
            question_text: q.question_text,
            option_a: q.option_a,
            option_b: q.option_b,
            option_c: q.option_c,
            option_d: q.option_d,
            marks: q.marks
        }));

        // Get existing responses
        const responses = storage.getResponsesByCandidateId(candidate.id);
        const responseMap = {};
        responses.forEach(r => {
            responseMap[r.question_id] = r.selected_option;
        });

        // Calculate remaining time
        const startTime = new Date(candidate.start_time);
        const now = new Date();
        const elapsedSeconds = Math.floor((now - startTime) / 1000);
        const totalSeconds = exam.duration_minutes * 60;
        const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);

        return {
            success: true,
            questions: questionsForDisplay,
            responses: responseMap,
            remainingSeconds,
            allowBackNavigation: exam.allow_back_navigation
        };
    },

    // Save answer
    saveAnswer(sessionToken, questionId, selectedOption) {
        const candidate = storage.getCandidateBySessionToken(sessionToken);
        if (!candidate) {
            return { success: false, message: 'Session expired' };
        }

        if (candidate.is_submitted) {
            return { success: false, message: 'Exam already submitted' };
        }

        const question = storage.getQuestionById(questionId);
        if (!question || question.exam_id !== candidate.exam_id) {
            return { success: false, message: 'Invalid question' };
        }

        const exam = storage.getExamById(candidate.exam_id);

        // Check if answer is correct
        const isCorrect = selectedOption && selectedOption.toUpperCase() === question.correct_option;
        let marksObtained = 0;

        if (selectedOption) {
            if (isCorrect) {
                marksObtained = question.marks || 1;
            } else if (exam.negative_marking > 0) {
                marksObtained = -exam.negative_marking;
            }
        }

        storage.saveResponse(candidate.id, questionId, selectedOption, isCorrect, marksObtained);

        return { success: true };
    },

    // Submit exam
    submitExam(sessionToken) {
        const candidate = storage.getCandidateBySessionToken(sessionToken);
        if (!candidate) {
            return { success: false, message: 'Session expired' };
        }

        if (candidate.is_submitted) {
            return { success: false, message: 'Exam already submitted' };
        }

        // Calculate final score
        const responses = storage.getResponsesByCandidateId(candidate.id);
        const totalScore = responses.reduce((sum, r) => sum + (r.marks_obtained || 0), 0);
        const score = Math.max(0, totalScore); // Don't allow negative total

        // Update candidate
        storage.updateCandidate(candidate.id, {
            is_submitted: 1,
            end_time: MCQUtils.getCurrentTimestamp(),
            score: score
        });

        return { success: true, message: 'Exam submitted successfully' };
    },

    // Get result
    getResult(sessionToken) {
        const candidate = storage.getCandidateBySessionToken(sessionToken);
        if (!candidate) {
            return { success: false, message: 'Result not found' };
        }

        if (!candidate.is_submitted) {
            return { success: false, message: 'Exam not yet submitted' };
        }

        const exam = storage.getExamById(candidate.exam_id);
        if (!exam) {
            return { success: false, message: 'Exam not found' };
        }

        // Check if user can see result based on result_mode
        let canViewResult = false;
        let message = '';

        switch (exam.result_mode) {
            case 'private':
            case 'public':
                canViewResult = true;
                break;
            case 'after_publish':
                canViewResult = exam.results_published === 1;
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
            const percentage = candidate.total_marks > 0
                ? ((candidate.score / candidate.total_marks) * 100).toFixed(2)
                : 0;

            return {
                success: true,
                canView: true,
                name: candidate.name,
                examTitle: exam.title,
                score: candidate.score,
                totalMarks: candidate.total_marks,
                percentage: percentage
            };
        } else {
            return {
                success: true,
                canView: false,
                message
            };
        }
    },

    // Get leaderboard
    getLeaderboard(examCode) {
        const exam = storage.getExamByCode(examCode);
        if (!exam) {
            return { success: false, message: 'Exam not found' };
        }

        if (exam.result_mode !== 'public' && !(exam.result_mode === 'after_publish' && exam.results_published)) {
            return { success: false, message: 'Leaderboard not available for this exam' };
        }

        const candidates = storage.getCandidatesByExamId(exam.id)
            .filter(c => c.is_submitted)
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return new Date(a.end_time) - new Date(b.end_time);
            });

        const leaderboard = candidates.map((c, index) => ({
            rank: index + 1,
            name: c.name,
            score: c.score,
            totalMarks: c.total_marks,
            percentage: c.total_marks > 0 ? ((c.score / c.total_marks) * 100).toFixed(2) : 0
        }));

        return {
            success: true,
            examTitle: exam.title,
            leaderboard
        };
    },

    // ==================== RESULTS APIs ====================

    // Get candidates for an exam
    getCandidates(examId) {
        const candidates = storage.getCandidatesByExamId(examId);
        return candidates.map(c => {
            const responses = storage.getResponsesByCandidateId(c.id);
            return {
                ...c,
                questions_answered: responses.length
            };
        }).sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (a.end_time && b.end_time) {
                return new Date(a.end_time) - new Date(b.end_time);
            }
            return 0;
        });
    },

    // Get candidate detail with responses
    getCandidateDetail(candidateId) {
        const candidate = storage.getCandidateById(candidateId);
        if (!candidate) {
            return { success: false, message: 'Candidate not found' };
        }

        const exam = storage.getExamById(candidate.exam_id);
        const responses = storage.getResponsesByCandidateId(candidateId);

        // Enrich responses with question data
        const enrichedResponses = responses.map(r => {
            const question = storage.getQuestionById(r.question_id);
            return {
                ...r,
                question_text: question.question_text,
                option_a: question.option_a,
                option_b: question.option_b,
                option_c: question.option_c,
                option_d: question.option_d,
                correct_option: question.correct_option,
                marks: question.marks
            };
        });

        return {
            success: true,
            candidate: {
                ...candidate,
                exam_title: exam.title,
                exam_code: exam.exam_code
            },
            responses: enrichedResponses
        };
    },

    // Delete candidate
    deleteCandidate(candidateId) {
        storage.deleteCandidate(candidateId);
        return { success: true };
    },

    // Export results as CSV
    exportResultsCSV(examId) {
        const exam = storage.getExamById(examId);
        const candidates = storage.getCandidatesByExamId(examId)
            .filter(c => c.is_submitted)
            .sort((a, b) => b.score - a.score);

        const data = candidates.map((c, index) => ({
            rank: index + 1,
            name: c.name,
            email: c.email,
            score: c.score,
            total_marks: c.total_marks,
            percentage: c.total_marks > 0 ? ((c.score / c.total_marks) * 100).toFixed(2) + '%' : '0%',
            start_time: c.start_time,
            end_time: c.end_time
        }));

        const columns = [
            { header: 'Rank', key: 'rank' },
            { header: 'Name', key: 'name' },
            { header: 'Email', key: 'email' },
            { header: 'Score', key: 'score' },
            { header: 'Total Marks', key: 'total_marks' },
            { header: 'Percentage', key: 'percentage' },
            { header: 'Start Time', key: 'start_time' },
            { header: 'End Time', key: 'end_time' }
        ];

        const csv = MCQUtils.arrayToCSV(data, columns);
        MCQUtils.downloadFile(csv, `${exam.exam_code}-results.csv`);

        return { success: true };
    },

    // ==================== SETTINGS APIs ====================

    getSettings() {
        return storage.getSettings();
    },

    updateSettings(data) {
        storage.updateSettings(data);
        return { success: true };
    },

    // ==================== DASHBOARD APIs ====================

    getDashboardStats() {
        const exams = storage.getAllExams();
        const questions = storage.getAllQuestions();
        const candidates = storage.getAllCandidates().filter(c => c.is_submitted);

        const recentExams = storage.getAllExamsWithStats()
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 5);

        return {
            totalExams: exams.length,
            activeExams: exams.filter(e => e.is_active).length,
            totalQuestions: questions.length,
            totalSubmissions: candidates.length,
            recentExams
        };
    }
};

// Export for use in other modules
window.api = api;

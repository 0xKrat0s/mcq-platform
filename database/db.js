const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// Use /tmp for Vercel serverless, local path for development
const isVercel = process.env.VERCEL === '1';
const dbPath = isVercel
    ? path.join('/tmp', 'exam_platform.db')
    : path.join(__dirname, 'exam_platform.db');

let db = null;
let SQL = null;

// Save database to file
function saveDatabase() {
    if (db) {
        try {
            const data = db.export();
            const buffer = Buffer.from(data);
            fs.writeFileSync(dbPath, buffer);
        } catch (error) {
            console.error('Error saving database:', error);
        }
    }
}

// Auto-save every 5 seconds
setInterval(saveDatabase, 5000);

// Helper to run queries (INSERT, UPDATE, DELETE)
function run(sql, params = []) {
    try {
        if (params.length > 0) {
            const stmt = db.prepare(sql);
            stmt.bind(params);
            stmt.step();
            stmt.free();
        } else {
            db.run(sql);
        }
        saveDatabase();

        // Get last insert id
        const result = db.exec("SELECT last_insert_rowid() as id");
        const lastId = result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : null;
        return { lastInsertRowid: lastId };
    } catch (error) {
        console.error('DB run error:', error, 'SQL:', sql);
        throw error;
    }
}

// Helper to get single row
function get(sql, params = []) {
    try {
        const stmt = db.prepare(sql);
        if (params.length > 0) {
            stmt.bind(params);
        }

        let result = null;
        if (stmt.step()) {
            result = stmt.getAsObject();
        }
        stmt.free();
        return result;
    } catch (error) {
        console.error('DB get error:', error, 'SQL:', sql);
        throw error;
    }
}

// Helper to get all rows
function all(sql, params = []) {
    try {
        const stmt = db.prepare(sql);
        if (params.length > 0) {
            stmt.bind(params);
        }

        const results = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
    } catch (error) {
        console.error('DB all error:', error, 'SQL:', sql);
        throw error;
    }
}

async function initialize() {
    try {
        SQL = await initSqlJs();

        // Load existing database or create new one
        if (fs.existsSync(dbPath)) {
            try {
                const fileBuffer = fs.readFileSync(dbPath);
                db = new SQL.Database(fileBuffer);
                console.log('Database loaded from file');
            } catch (error) {
                console.log('Error loading database, creating new one');
                db = new SQL.Database();
            }
        } else {
            db = new SQL.Database();
            console.log('New database created');
        }

        // Create tables
        db.run(`
            CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS exams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                exam_code TEXT UNIQUE NOT NULL,
                description TEXT,
                duration_minutes INTEGER NOT NULL DEFAULT 30,
                marks_per_question INTEGER DEFAULT 1,
                negative_marking REAL DEFAULT 0,
                result_mode TEXT DEFAULT 'admin_only',
                allow_back_navigation INTEGER DEFAULT 1,
                shuffle_questions INTEGER DEFAULT 0,
                prevent_duplicate_attempts INTEGER DEFAULT 1,
                is_active INTEGER DEFAULT 1,
                results_published INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                exam_id INTEGER NOT NULL,
                question_text TEXT NOT NULL,
                option_a TEXT NOT NULL,
                option_b TEXT NOT NULL,
                option_c TEXT NOT NULL,
                option_d TEXT NOT NULL,
                correct_option TEXT NOT NULL,
                marks INTEGER DEFAULT 1,
                question_order INTEGER,
                FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS candidates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                exam_id INTEGER NOT NULL,
                session_token TEXT UNIQUE,
                start_time DATETIME,
                end_time DATETIME,
                score INTEGER,
                total_marks INTEGER,
                is_submitted INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS responses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                candidate_id INTEGER NOT NULL,
                question_id INTEGER NOT NULL,
                selected_option TEXT,
                is_correct INTEGER,
                marks_obtained REAL DEFAULT 0,
                answered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
                FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
            )
        `);

        // Create unique index for responses if not exists
        try {
            db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_responses_unique ON responses(candidate_id, question_id)`);
        } catch (e) {
            // Index might already exist
        }

        // Site settings table for branding customization
        db.run(`
            CREATE TABLE IF NOT EXISTS site_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                portal_title TEXT DEFAULT 'Exam Portal',
                portal_subtitle TEXT DEFAULT 'Enter your details to begin',
                company_name TEXT,
                company_logo TEXT,
                company_website TEXT,
                institute_name TEXT,
                institute_logo TEXT,
                footer_text TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Insert default settings if not exists
        const settingsCheck = get('SELECT id FROM site_settings WHERE id = 1');
        if (!settingsCheck) {
            run('INSERT INTO site_settings (id) VALUES (1)', []);
        }

        // Create default admin if not exists
        const adminCheck = get('SELECT id FROM admins WHERE username = ?', ['admin']);
        if (!adminCheck) {
            const hashedPassword = bcrypt.hashSync('admin123', 10);
            run('INSERT INTO admins (username, password) VALUES (?, ?)', ['admin', hashedPassword]);
            console.log('Default admin account created. Please change the password after first login.');
        }

        saveDatabase();
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Database initialization error:', error);
        throw error;
    }
}

module.exports = {
    get db() { return db; },
    initialize,
    run,
    get,
    all,
    saveDatabase
};

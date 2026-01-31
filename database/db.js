const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// Detect if we should use Turso (production) or local SQLite (development)
const useTurso = !!(process.env.TURSO_URL && process.env.TURSO_AUTH_TOKEN);

let db = null;
let dbType = null;

// Local SQLite paths
const dbPath = path.join(__dirname, 'exam_platform.db');

// Save database to file (only for local SQLite)
function saveDatabase() {
    if (dbType === 'sqlite' && db) {
        try {
            const data = db.export();
            const buffer = Buffer.from(data);
            fs.writeFileSync(dbPath, buffer);
        } catch (error) {
            console.error('Error saving database:', error);
        }
    }
}

// Helper to run queries (INSERT, UPDATE, DELETE)
async function run(sql, params = []) {
    if (dbType === 'turso') {
        try {
            const result = await db.execute({ sql, args: params });
            return { lastInsertRowid: Number(result.lastInsertRowid) };
        } catch (error) {
            console.error('DB run error:', error, 'SQL:', sql);
            throw error;
        }
    } else {
        // Local SQLite (sql.js)
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

            const result = db.exec("SELECT last_insert_rowid() as id");
            const lastId = result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : null;
            return { lastInsertRowid: lastId };
        } catch (error) {
            console.error('DB run error:', error, 'SQL:', sql);
            throw error;
        }
    }
}

// Helper to get single row
async function get(sql, params = []) {
    if (dbType === 'turso') {
        try {
            const result = await db.execute({ sql, args: params });
            if (result.rows.length > 0) {
                return result.rows[0];
            }
            return null;
        } catch (error) {
            console.error('DB get error:', error, 'SQL:', sql);
            throw error;
        }
    } else {
        // Local SQLite (sql.js)
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
}

// Helper to get all rows
async function all(sql, params = []) {
    if (dbType === 'turso') {
        try {
            const result = await db.execute({ sql, args: params });
            return result.rows;
        } catch (error) {
            console.error('DB all error:', error, 'SQL:', sql);
            throw error;
        }
    } else {
        // Local SQLite (sql.js)
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
}

// Schema creation SQL statements
const schemaStatements = [
    `CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS exams (
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
    )`,
    `CREATE TABLE IF NOT EXISTS questions (
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
    )`,
    `CREATE TABLE IF NOT EXISTS candidates (
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
    )`,
    `CREATE TABLE IF NOT EXISTS responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        candidate_id INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        selected_option TEXT,
        is_correct INTEGER,
        marks_obtained REAL DEFAULT 0,
        answered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS site_settings (
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
    )`
];

async function initialize() {
    try {
        if (useTurso) {
            // Use Turso (libsql) for production
            const { createClient } = require('@libsql/client');
            db = createClient({
                url: process.env.TURSO_URL,
                authToken: process.env.TURSO_AUTH_TOKEN
            });
            dbType = 'turso';
            console.log('Connected to Turso database');
        } else {
            // Use local SQLite (sql.js) for development
            const initSqlJs = require('sql.js');
            const SQL = await initSqlJs();

            if (fs.existsSync(dbPath)) {
                try {
                    const fileBuffer = fs.readFileSync(dbPath);
                    db = new SQL.Database(fileBuffer);
                    console.log('Local database loaded from file');
                } catch (error) {
                    console.log('Error loading database, creating new one');
                    db = new SQL.Database();
                }
            } else {
                db = new SQL.Database();
                console.log('New local database created');
            }
            dbType = 'sqlite';

            // Auto-save every 5 seconds for local SQLite
            setInterval(saveDatabase, 5000);
        }

        // Create tables
        for (const sql of schemaStatements) {
            await run(sql);
        }

        // Create unique index for responses
        try {
            await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_responses_unique ON responses(candidate_id, question_id)`);
        } catch (e) {
            // Index might already exist
        }

        // Insert default settings if not exists
        const settingsCheck = await get('SELECT id FROM site_settings WHERE id = 1');
        if (!settingsCheck) {
            await run('INSERT INTO site_settings (id) VALUES (1)', []);
        }

        // Create default admin if not exists
        const adminCheck = await get('SELECT id FROM admins WHERE username = ?', ['admin']);
        if (!adminCheck) {
            const hashedPassword = bcrypt.hashSync('admin123', 10);
            await run('INSERT INTO admins (username, password) VALUES (?, ?)', ['admin', hashedPassword]);
            console.log('Default admin account created. Please change the password after first login.');
        }

        if (dbType === 'sqlite') {
            saveDatabase();
        }

        console.log(`Database initialized successfully (${dbType})`);
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

# MCQ Exam Platform

A complete MCQ examination platform with admin control panel and user exam interface.

## Features

### Admin Panel
- Create and manage exams with customizable settings
- Add, edit, and delete questions
- View detailed results and analytics
- Export results to CSV
- Four result visibility modes:
  - **Admin Only** - Only admin can see results
  - **Private** - Only the candidate can see their own score
  - **Public Leaderboard** - Everyone can see all scores
  - **Publish Later** - Admin decides when to publish results

### User Interface
- Simple exam entry with name and exam code
- Timer with auto-submit when time ends
- Question navigation with progress indicators
- Mobile-responsive design

### Exam Settings
- Configurable duration
- Enable/disable back navigation
- Shuffle questions per candidate
- Prevent duplicate attempts
- Negative marking support

## Installation

1. Make sure you have [Node.js](https://nodejs.org/) installed (v14 or higher)

2. Navigate to the project directory:
   ```bash
   cd mcq-exam-platform
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Start the server:
   ```bash
   npm start
   ```

   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

5. Open your browser:
   - **User Portal**: http://localhost:3000
   - **Admin Panel**: http://localhost:3000/admin

## Default Admin Credentials

- **Username**: admin
- **Password**: admin123

**Important**: Change the default password after first login!

## Project Structure

```
mcq-exam-platform/
├── database/
│   └── db.js              # SQLite database setup
├── public/
│   ├── css/
│   │   └── style.css      # All styles
│   ├── index.html         # User entry page
│   ├── exam.html          # Exam taking interface
│   ├── submitted.html     # Post-submission page
│   └── leaderboard.html   # Public leaderboard
├── routes/
│   ├── admin.js           # Admin routes
│   ├── api.js             # API endpoints
│   └── exam.js            # Exam/user routes
├── views/
│   └── admin/
│       ├── login.html
│       ├── dashboard.html
│       ├── exams.html
│       ├── questions.html
│       ├── results.html
│       ├── exam-results.html
│       ├── candidate-detail.html
│       └── settings.html
├── package.json
├── server.js              # Main server file
└── README.md
```

## Result Visibility Modes Explained

| Mode | Description |
|------|-------------|
| Admin Only | No user can see their score. Only admin can view all results. |
| Private | Each user can only see their own score after submission. |
| Public | All users can see a leaderboard with everyone's scores. |
| Publish Later | No one sees scores until admin clicks "Publish Results". |

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: SQLite (using better-sqlite3)
- **Frontend**: Vanilla HTML, CSS, JavaScript
- **Authentication**: express-session + bcryptjs

## API Endpoints

### Admin APIs
- `GET /api/exams` - List all exams
- `POST /api/exams` - Create exam
- `PUT /api/exams/:id` - Update exam
- `DELETE /api/exams/:id` - Delete exam
- `GET /api/exams/:id/questions` - Get questions
- `POST /api/exams/:id/questions` - Add question
- `GET /api/exams/:id/candidates` - Get candidates
- `GET /api/exams/:id/export` - Export results CSV

### User APIs
- `POST /exam/start` - Start exam session
- `GET /exam/questions` - Get exam questions
- `POST /exam/answer` - Save answer
- `POST /exam/submit` - Submit exam
- `GET /exam/result/:token` - Check result
- `GET /exam/leaderboard/:code` - Get leaderboard

## License

MIT License

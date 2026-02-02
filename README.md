# MCQ Exam Platform (Static Version)

A simple and powerful platform for conducting MCQ-based examinations. This is a fully static version that runs entirely in the browser using localStorage for data persistence.

## Features

- Create and manage multiple exams
- Rich question editor with Markdown support
- Flexible result visibility modes (Admin Only, Private, Public, Publish Later)
- Timer with auto-submit functionality
- Prevent duplicate attempts
- Detailed analytics and CSV export
- Responsive design for all devices
- No server required - runs on GitHub Pages

## Quick Start

1. Open `index.html` in your browser, or deploy to GitHub Pages
2. Access the admin panel at `/admin/`
3. Default admin credentials: `admin` / `admin123`

## Deployment

### GitHub Pages

1. Push this repository to GitHub
2. Go to Settings > Pages
3. Enable GitHub Pages from the main branch
4. Your exam platform will be live at `https://<username>.github.io/<repo>/`

The included GitHub Actions workflow (`.github/workflows/deploy.yml`) will automatically deploy on push to main.

### Other Static Hosting

Simply upload all files to any static hosting service (Netlify, Vercel, Cloudflare Pages, etc.).

## File Structure

```
/mcq-exam-platform/
├── index.html              # User entry page
├── exam.html               # Exam taking interface
├── submitted.html          # Results page
├── leaderboard.html        # Public leaderboard
├── admin/                  # Admin panel
│   ├── index.html          # Login page
│   ├── dashboard.html      # Dashboard
│   ├── exams.html          # Exam management
│   ├── questions.html      # Question editor
│   ├── results.html        # Results overview
│   ├── exam-results.html   # Exam-specific results
│   ├── candidate-detail.html # Candidate responses
│   └── settings.html       # Portal settings
├── css/
│   └── style.css           # Styles
├── js/
│   ├── utils.js            # Utility functions
│   ├── storage.js          # localStorage wrapper
│   ├── auth.js             # Authentication
│   └── api.js              # API layer
├── .github/
│   └── workflows/
│       └── deploy.yml      # GitHub Pages deployment
└── .nojekyll               # Disable Jekyll processing
```

## Data Storage

All data is stored in the browser's localStorage:

- `mcq_exams` - Exam configurations
- `mcq_questions` - Questions for each exam
- `mcq_candidates` - Candidate registrations
- `mcq_responses` - Candidate answers
- `mcq_settings` - Portal branding settings
- `mcq_admins` - Admin accounts

**Note:** Clearing browser data will erase all exams, questions, and results. Data is stored per-browser and is not shared across devices.

## Limitations

Compared to the server-based version:

| Feature | Server Version | Static Version |
|---------|---------------|----------------|
| Security | Server-side auth | Client-side (visible in browser) |
| Data persistence | Database | localStorage (~5MB limit) |
| Multi-device sync | Shared database | Per-browser storage |
| Question hiding | Server returns w/o answers | Answers visible in dev tools |

This static version is ideal for:
- Personal use
- Small-scale exams
- Demonstrations
- Quick deployments without server setup

## License

MIT License

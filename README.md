# DigiSecureExam

Exam-wise identity, OTR, allocation, staff ID / gate pass, sentinel gate (QR + face match), and live dashboards.

## Local development

Requires Node.js 20+.

```bash
npm install
npm run dev
```

- Web UI: http://localhost:5173
- API: http://localhost:4170

OTP for student/public flows: `123456`.

## Portals

- `/` Public OTR and staff registration
- `/login` Unified login
- `/digi-exam/{slug}` Exam apply and retrieve gate pass
- `/admin` Main Admin
- `/control-room` Client exam dashboard (bound exams only)
- `/centre` Centre incharge
- `/gate` Sentinel gate device
- `/classroom` Classroom presence device
- `/staff` Staff ID card and gate pass download

SQLite is stored under `data/` (not in git).

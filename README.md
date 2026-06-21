# 🧠 QueryAI — Gen AI Optimal Query Development

> An AI-powered SQL query assistant with DDL/DML/DCL analysis, time complexity estimation, row prediction, code quality scoring, and optimization suggestions — powered by Google Gemini.

---

## ✨ Features

| Feature | Description |
|---|---|
| 💬 **GPT-style Chat** | Ask any SQL/DBMS question in natural language with memory |
| 🔍 **SQL Analyzer** | Full analysis with DDL/DML/DCL classification |
| ⏱️ **Time Complexity** | O(n), O(n log n), O(n²) estimation per query |
| 🛡️ **Code Quality Score** | Grades your queries from 0 to 100 based on standard conventions |
| 📊 **Row Prediction** | Estimate rows affected with warnings |
| 🚀 **Query Optimizer** | AI-powered optimization suggestions |
| ⚡ **Query Execution** | Run SQL directly in the app and view results in a data grid |
| 🔀 **Multiple Alternatives** | Get 2-3 distinct SQL approaches for ambiguous NLP queries |
| ✏️ **SQL Editor** | Monaco Editor (VS Code-style) for SQL with live DB integration |

---

## 🚀 Quick Start

### Step 1: Start the Backend (Node.js/Express)

```bash
cd backend-node
npm install
npm start
```

Backend will be running on: `http://localhost:9000`

> **Note:** Make sure you create a `.env` file in `backend-node/` using `.env.example` as a template. You must provide a valid `GEMINI_API_KEY` and a custom `CLIENT_API_KEY`.

### Step 2: Start the Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev
```

Frontend will be running on: `http://localhost:3000`

> **Note:** Create a `.env.local` file in `frontend/` and add `NEXT_PUBLIC_CLIENT_API_KEY=your_secret_key` matching the backend to authenticate your requests.

---

## 📁 Project Structure

```
Gen_AI_Optimal_query_development/
├── backend-node/
│   ├── src/
│   │   ├── controllers/       # Route controllers
│   │   ├── middlewares/       # Rate limiting, input validation, Auth
│   │   ├── routes/            # Express routers
│   │   └── services/          # Gemini AI, SQL Parser, Code Quality
│   ├── app.js                 # Express App & Security Setup
│   ├── server.js              # Entry point
│   ├── seed_hr.js             # SQLite HR Database Seeder
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── app/
│   │   ├── page.tsx           # Main UI (Chat, Analyzer, Editor, NLP)
│   │   ├── layout.tsx
│   │   └── globals.css        # Brutalist / Flat Design System
│   └── package.json
└── README.md
```

---

## 🔒 Security Posture
The backend has been hardened according to OWASP standards:
- **Rate Limiting:** Protects AI endpoints from DDoS and spam.
- **Input Validation:** Strict parsing rejects unexpected fields or oversized payloads.
- **API Key Auth:** Global middleware ensures frontend access is restricted to authorized clients.
- **Read-Only Sandbox:** Executing SQL queries strictly forbids destructive commands (`DROP`, `DELETE`, `ALTER`, etc.).

---

## ⚙️ Tech Stack

- **Frontend**: Next.js 14 + React + Custom CSS + Monaco Editor
- **Backend**: Node.js + Express.js 4
- **AI**: Google Gemini 1.5 Flash
- **Database Support**: SQLite (Local demo) & PostgreSQL (Supabase)
- **Design**: Modern Flat Brutalism UI with Micro-animations

---

## ⚠️ Important

- Keep your `.env` file private — never commit it to git.
- The AI only answers SQL/DBMS-related questions (by design).
- Do not connect this app to a production database, only use sandboxed mock databases.

---

Made with ❤️ using Google Gemini AI

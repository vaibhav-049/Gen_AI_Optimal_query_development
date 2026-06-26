# 🧠 QueryAI v3.0 — Gen AI Optimal Query Development

> An advanced AI-powered SQL query assistant featuring **User Authentication, Per-User Database Isolation, Local LLM Integration (Ollama), Token Capping**, and DDL/DML/DCL analysis. Now powered by **Ollama (Qwen)** for privacy and cost-efficiency, with **Google Gemini** as a cloud fallback.

---

## ✨ What's New in v3.0

| Feature | Description |
|---|---|
| 🔐 **User Authentication** | Full Signup/Login system with `bcrypt` password hashing and secure `JWT` cookies. |
| 🗄️ **Per-User Isolation** | Every user gets their own dedicated `SQLite` database sandbox. Your data is 100% private. |
| 🤖 **Local LLM via Ollama** | Uses `qwen2.5-coder:3b` for SQL generation and `qwen3:8b` for chat. **Zero API costs.** |
| 🧠 **Thinking Mode** | Uses Qwen's `/think` capability for Claude-like reasoning to prevent SQL hallucinations. |
| 🪙 **Token Capping** | Daily token limits (e.g., 50,000/day) per user. Tracks usage across models. |
| 💎 **Premium UI** | Upgraded frontend with Glassmorphism, deep dark gradients, and micro-animations. |

---

## 🚀 Quick Start

### Step 1: Install & Run Ollama (Local LLM)
1. Download and install [Ollama](https://ollama.com/).
2. Pull the required models:
```bash
ollama run qwen2.5-coder:3b
ollama run qwen3:8b
```
3. Ensure Ollama is running in the background (default: `http://localhost:11434`).

### Step 2: Start the Backend (Node.js/Express)
```bash
cd backend-node
npm install
```
Create a `.env` file in `backend-node/`:
```env
PORT=9000
JWT_SECRET=your_super_secret_jwt_key
OLLAMA_URL=http://localhost:11434
LLM_PRIMARY=ollama
TOKEN_CAP_DAILY=50000
GEMINI_API_KEY=your_gemini_key_here (optional fallback)
CORS_ORIGINS=http://localhost:3000
```
```bash
npm run dev
```

### Step 3: Start the Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000` in your browser. Create an account to begin!

---

## ⚙️ Tech Stack

- **Frontend**: Next.js 14 + React + Glassmorphism UI + Monaco Editor
- **Backend**: Node.js + Express.js 4
- **Security**: `bcrypt` (Hashing), `jsonwebtoken` (Auth), `express-rate-limit`, `helmet`
- **AI Models**: 
  - Primary: **Ollama** (`qwen2.5-coder:3b`, `qwen3:8b`)
  - Secondary/Cloud: **Google Gemini 1.5 Flash**
- **Databases**: SQLite (User Accounts & Per-User DBs) & PostgreSQL (Supabase)

---

## 📁 Project Structure

```
Gen_AI_Optimal_query_development/
├── backend-node/
│   ├── data/                  # Auto-generated per-user isolated SQLite databases
│   ├── src/
│   │   ├── controllers/       # Auth, Query, DB controllers
│   │   ├── middlewares/       # JWT Auth, Rate limiting
│   │   ├── routes/            # API endpoints
│   │   └── services/          # Ollama Router, Gemini, SQL Parser, User DB
│   ├── app.js                 # Express App
│   ├── server.js              # Entry point
│   └── package.json
├── frontend/
│   ├── app/
│   │   ├── page.tsx           # Main App UI (Auth, Chat, Analyzer)
│   │   └── globals.css        # Premium Dark Mode / Glassmorphism
│   └── package.json
└── README.md
```

---

## 🔒 Security Posture
- **Auth**: Passwords are hashed (12 rounds). Sessions use HTTP-only, SameSite cookies.
- **Data Privacy**: Complete data silo-ing. User A's data can never be queried by User B.
- **Anti-Hallucination**: LLMs are provided with exact schema metadata, preventing fake tables/columns. 
- **Execution Sandbox**: Users can execute generated SQL, but it only runs within their cloned `demo.sqlite` environment.

---

## ⚠️ Important
- Keep your `.env` file private.
- The `data/` directory (where user DBs are stored) is ignored in git to prevent data leaks.
- To use cloud Postgres, provide the URL in the sidebar of the application.

---
Made with ❤️ using Ollama & Google Gemini.

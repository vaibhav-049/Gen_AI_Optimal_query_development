"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import dynamic from "next/dynamic";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });


const API_BASE = process.env.NEXT_PUBLIC_API_URL || 
  (typeof window !== "undefined" && window.location.hostname !== "localhost" 
    ? `http://${window.location.hostname}:9000` 
    : "http://localhost:9000");

interface AuthUser { id: number; email: string; }
interface TokenUsage { tokens_used_today: number; token_cap: number; remaining: number; }

type Mode = "chat" | "analyze" | "editor" | "nlp";
type PanelTab = "analysis" | "quality" | "tables" | "tips" | "results";

interface Message { role: "user" | "assistant"; content: string; }

interface AnalysisResult {
  classification?: { category: string; category_full: string; sub_type: string; color: string; description: string; };
  complexity?: { complexity: string; complexity_label: string; score: number; performance: string; operations: string[]; optimization_tips: string[]; };
  rows_affected?: { estimated_rows: number; confidence: string; impact: string; warning: string | null; has_where: boolean; };
  quality?: { score: number; grade: string; grade_label: string; grade_color: string; good_practices: string[]; deductions: {criterion: string; deducted: number; tip: string}[]; };
  tables_info?: { tables: string[]; columns_by_table: Record<string,string[]>; joins: {type:string;table:string}[]; operations: string[]; where_conditions: string[]; total_tables: number; total_joins: number; };
}

interface DBStatus { connected: boolean; db_type?: string; db_path?: string; schema_text?: string; }
interface ChatSession { id: string; name: string; messages: Message[]; }
interface ExecutionResult { status: string; columns?: string[]; data?: any[]; message?: string; error?: string; rows_returned?: number; rows_affected?: number; }

const safeGetItem = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const safeSetItem = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch {} };

export default function Home() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [mode, setMode] = useState<Mode>("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [nlpInput, setNlpInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [nlpLoading, setNlpLoading] = useState(false);
  const [sqlCode, setSqlCode] = useState("-- Write your SQL here\nSELECT s.name, s.marks, s.department\nFROM students s\nWHERE s.marks > 80\nORDER BY s.marks DESC\nLIMIT 10;");
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>("analysis");
  const [analyzing, setAnalyzing] = useState(false);
  const [sidebarItem, setSidebarItem] = useState("chat");
  const [dbStatus, setDbStatus] = useState<DBStatus>({ connected: false });
  const [connectingDB, setConnectingDB] = useState(false);
  const [nlpResult, setNlpResult] = useState("");
  const [nlpSuggestions, setNlpSuggestions] = useState("");
  const [nlpMode, setNlpMode] = useState<"nlp-to-sql" | "suggest">("nlp-to-sql");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [apiCache, setApiCache] = useState<Record<string, any>>({});
  const [customDbUrl, setCustomDbUrl] = useState("");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editSessionName, setEditSessionName] = useState("");
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [executing, setExecuting] = useState(false);
  
  const apiHeaders = { "Content-Type": "application/json" };
  const fetchOpts = { credentials: "include" as RequestCredentials };

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setAuthUser(data.user);
        setTokenUsage(data.usage);
      }
    } catch {}
    setAuthLoading(false);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthSubmitting(true);
    try {
      const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/signup";
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: authEmail, password: authPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setAuthUser(data.user);
        setAuthEmail("");
        setAuthPassword("");
        checkAuth();
      } else {
        setAuthError(data.message || "Something went wrong.");
      }
    } catch {
      setAuthError("Cannot reach the server.");
    }
    setAuthSubmitting(false);
  };

  const handleLogout = async () => {
    await fetch(`${API_BASE}/api/auth/logout`, { method: "POST", credentials: "include" });
    setAuthUser(null);
    setTokenUsage(null);
    setMessages([]);
    setSessions([]);
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    connectDB();
    const saved = safeGetItem("queryai_sessions");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.length > 0) {
          setSessions(parsed);
          setActiveSessionId(parsed[0].id);
          setMessages(parsed[0].messages);
        } else createNewSession();
      } catch { createNewSession(); }
    } else createNewSession();
  }, []);

  useEffect(() => {
    if (!activeSessionId) return;
    setSessions(prev => {
      const updated = prev.map(s => s.id === activeSessionId ? { ...s, messages } : s);
      safeSetItem("queryai_sessions", JSON.stringify(updated));
      return updated;
    });
  }, [messages, activeSessionId]);

  const createNewSession = () => {
    const newId = Date.now().toString();
    const newSession = { id: newId, name: "New Chat", messages: [] };
    setSessions(prev => {
      const updated = [newSession, ...prev];
      safeSetItem("queryai_sessions", JSON.stringify(updated));
      return updated;
    });
    setActiveSessionId(newId);
    setMessages([]);
    setMode("chat");
    setSidebarItem("chat");
  };

  const loadSession = (id: string) => {
    const session = sessions.find(s => s.id === id);
    if (session) {
      setActiveSessionId(id);
      setMessages(session.messages);
      setMode("chat");
      setSidebarItem("chat");
    }
  };

  const renameSession = (id: string, newName: string) => {
    if (newName.trim()) {
      setSessions(prev => {
        const updated = prev.map(s => s.id === id ? { ...s, name: newName.trim() } : s);
        safeSetItem("queryai_sessions", JSON.stringify(updated));
        return updated;
      });
    }
    setEditingSessionId(null);
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.filter(s => s.id !== id);
    safeSetItem("queryai_sessions", JSON.stringify(updated));
    setSessions(updated);
    
    if (activeSessionId === id) {
      if (updated.length > 0) {
        setActiveSessionId(updated[0].id);
        setMessages(updated[0].messages);
      } else {
        createNewSession();
      }
    }
  };

  const autoResize = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  };

  const connectDB = async (url?: string) => {
    setConnectingDB(true);
    try {
      const payload = url && url.startsWith("postgres") 
        ? { db_path: url, db_type: "postgres" } 
        : {};

      const res = await fetch(`${API_BASE}/api/db/connect`, {
        method: "POST", headers: apiHeaders, credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.status === "success" || data.status === "connected") {
        const schemaRes = await fetch(`${API_BASE}/api/db/schema`, { credentials: "include" });
        const schemaData = await schemaRes.json();
        setDbStatus({ connected: true, db_type: schemaData.type || "SQLite", db_path: schemaData.path, schema_text: schemaData.schema_text });
      }
    } catch { setDbStatus({ connected: false }); }
    finally { setConnectingDB(false); }
  };

  const sendMessage = async (msg?: string) => {
    const text = msg || input.trim();
    if (!text || loading) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/query/chat`, {
        method: "POST", headers: apiHeaders, credentials: "include",
        body: JSON.stringify({ message: text, history: messages.map(m => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setMessages(prev => [...prev, { role: "assistant", content: `Error: ${data.error || 'Failed to generate response.'}` }]);
        return;
      }
      setMessages(prev => [...prev, { role: "assistant", content: data.response }]);
      
      // Auto-Execute Logic for Visualization
      const sqlMatch = data.response.match(/```sql\n([\s\S]*?)```/i);
      if (sqlMatch && sqlMatch[1]) {
        const extractedSql = sqlMatch[1].trim();
        if (extractedSql.toUpperCase().includes("SELECT")) {
          setPanelTab("results");
          runSQL(extractedSql);
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Error: Could not reach the backend on port 9000." }]);
    } finally { setLoading(false); }
  };

  const fetchSuggestions = async (sql: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/query/suggest`, {
        method: "POST", headers: apiHeaders, credentials: "include",
        body: JSON.stringify({ requirement: `Suggest better alternatives and optimizations for this query:\n${sql}` }),
      });
      const data = await res.json();
      setNlpSuggestions(data.response || "");
    } catch {}
  };

  const analyzeSQL = async (sql?: string, fromNLP = false) => {
    const query = sql || sqlCode;
    if (!query.trim()) return;
    setAnalyzing(true);
    setAnalysisResult(null);

    const cacheKey = `analyze_${query}`;
    if (apiCache[cacheKey] && !apiCache[cacheKey].ai_explanation?.startsWith("Error:")) {
      const data = apiCache[cacheKey];
      setAnalysisResult({
        classification: data.classification,
        complexity: data.complexity,
        rows_affected: data.rows_affected,
        quality: data.quality,
        tables_info: data.tables_info,
      });
      if (data.ai_explanation) {
        setMessages(prev => [
          ...prev,
          { role: "user", content: `Analyze this query:\n\`\`\`sql\n${query}\n\`\`\`` },
          { role: "assistant", content: data.ai_explanation },
        ]);
        setMode("chat");
        setSidebarItem("chat");
      }
      setAnalyzing(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/query/analyze`, {
        method: "POST", headers: apiHeaders, credentials: "include",
        body: JSON.stringify({ sql: query }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setMessages(prev => [
          ...prev,
          { role: "user", content: `Analyze this query:\n\`\`\`sql\n${query}\n\`\`\`` },
          { role: "assistant", content: `Error: ${data.error || 'Failed to analyze query.'}` },
        ]);
        setMode("chat");
        setSidebarItem("chat");
        return;
      }
      setApiCache(prev => ({ ...prev, [cacheKey]: data }));
      setAnalysisResult({
        classification: data.classification,
        complexity: data.complexity,
        rows_affected: data.rows_affected,
        quality: data.quality,
        tables_info: data.tables_info,
      });
      if (data.ai_explanation && !fromNLP) {
        setMessages(prev => [
          ...prev,
          { role: "user", content: `Analyze this query:\n\`\`\`sql\n${query}\n\`\`\`` },
          { role: "assistant", content: data.ai_explanation },
        ]);
        setMode("chat");
        setSidebarItem("chat");
      }
      
      // Auto-suggest logic if quality is low
      if (fromNLP && data.quality && data.quality.score < 85) {
        fetchSuggestions(query);
      }
    } catch { alert("Backend not reachable on port 9000."); }
    finally { setAnalyzing(false); }
  };

  const runSQL = async (sql?: string) => {
    const queryToRun = sql || sqlCode;
    if (!queryToRun.trim() || executing) return;
    setExecuting(true);
    setExecutionResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/query/execute`, {
        method: "POST", headers: apiHeaders, credentials: "include",
        body: JSON.stringify({ sql: queryToRun }),
      });
      const data = await res.json();
      setExecutionResult(data);
    } catch {
      setExecutionResult({ status: "error", error: "Could not connect to backend." });
    } finally {
      setExecuting(false);
    }
  };

  const runNLP = async () => {
    if (!nlpInput.trim() || nlpLoading) return;
    setNlpLoading(true);
    setNlpResult("");

    const cacheKey = `nlp_${nlpMode}_${nlpInput}`;
    if (apiCache[cacheKey] && typeof apiCache[cacheKey] === "string" && !apiCache[cacheKey].startsWith("Error:")) {
      setNlpResult(apiCache[cacheKey]);
      setNlpLoading(false);
      return;
    }

    try {
      const endpoint = nlpMode === "nlp-to-sql" ? "/api/query/nlp-to-sql" : "/api/query/suggest";
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST", headers: apiHeaders, credentials: "include",
        body: JSON.stringify({ requirement: nlpInput }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setNlpResult(`Error: ${data.error || 'Failed to process text.'}`);
        return;
      }
      const resultText = data.response || "No response received";
      setApiCache(prev => ({ ...prev, [cacheKey]: resultText }));
      setNlpResult(resultText);
      setNlpSuggestions(""); // clear previous suggestions
      
      // Auto-Analysis and Execution Trigger
      if (nlpMode === "nlp-to-sql") {
        const sqlMatch = resultText.match(/```sql\n([\s\S]*?)```/i);
        if (sqlMatch && sqlMatch[1]) {
          const extractedSql = sqlMatch[1].trim();
          setPanelTab("analysis");
          analyzeSQL(extractedSql, true);
          if (extractedSql.toUpperCase().includes("SELECT")) {
            runSQL(extractedSql);
          }
        }
      }
    } catch { setNlpResult("Error: Could not connect to backend."); }
    finally { setNlpLoading(false); }
  };

  const navItems = [
    { id: "chat", label: "Chat Assistant" },
    { id: "nlp", label: "English to SQL" },
    { id: "analyze", label: "SQL Analyzer" },
    { id: "editor", label: "SQL Editor" },
  ];

  const MdRenderer = ({ content }: { content: string }) => (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
      code({ className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || "");
        return match ? (
          <SyntaxHighlighter style={vscDarkPlus as any} language={match[1]} PreTag="div">
            {String(children).replace(/\n$/, "")}
          </SyntaxHighlighter>
        ) : <code className={className} {...props}>{children}</code>;
      },
    }}>{content}</ReactMarkdown>
  );

  if (authLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: "var(--bg-primary)", color: "var(--text-secondary)", fontSize: "14px" }}>
        Loading...
      </div>
    );
  }

  if (!authUser) {
    return (
      <div style={{ 
        display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", 
        background: "radial-gradient(circle at 50% -20%, #1a1a2e 0%, #121212 70%)", 
        color: "var(--text-primary)", fontFamily: "'Inter', sans-serif" 
      }}>
        <div style={{ 
          width: "420px", padding: "48px 40px", 
          background: "rgba(30, 30, 30, 0.6)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "20px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0,0,0,0.2)"
        }}>
          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <h1 style={{ 
              fontSize: "28px", fontWeight: 700, margin: "0 0 8px 0", letterSpacing: "-0.5px",
              background: "linear-gradient(135deg, #fff 0%, #a3a3a3 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"
            }}>
              QueryAI
            </h1>
            <p style={{ fontSize: "14px", color: "var(--text-muted)", margin: 0 }}>
              {authMode === "login" ? "Welcome back! Please enter your details." : "Create an account to get started."}
            </p>
          </div>

          <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "8px", color: "var(--text-secondary)" }}>Email address</label>
              <input
                type="email" placeholder="you@example.com" value={authEmail} required
                onChange={(e) => setAuthEmail(e.target.value)}
                style={{ 
                  width: "100%", padding: "12px 16px", background: "rgba(0,0,0,0.2)", 
                  border: "1px solid rgba(255,255,255,0.1)", color: "white", fontSize: "15px", 
                  borderRadius: "12px", outline: "none", transition: "all 0.2s ease"
                }}
                onFocus={(e) => e.target.style.borderColor = "var(--accent-primary)"}
                onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
              />
            </div>
            
            <div style={{ position: "relative" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "8px", color: "var(--text-secondary)" }}>Password</label>
              <input
                type={showPassword ? "text" : "password"} placeholder="••••••••" value={authPassword} required
                onChange={(e) => setAuthPassword(e.target.value)}
                style={{ 
                  width: "100%", padding: "12px 48px 12px 16px", background: "rgba(0,0,0,0.2)", 
                  border: "1px solid rgba(255,255,255,0.1)", color: "white", fontSize: "15px", 
                  borderRadius: "12px", outline: "none", transition: "all 0.2s ease"
                }}
                onFocus={(e) => e.target.style.borderColor = "var(--accent-primary)"}
                onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                style={{ 
                  position: "absolute", right: "12px", top: "36px", background: "none", 
                  border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "4px",
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                )}
              </button>
            </div>

            {authError && (
              <div style={{ 
                fontSize: "13px", color: "#fca5a5", padding: "12px", 
                border: "1px solid rgba(248, 113, 113, 0.3)", background: "rgba(239, 68, 68, 0.1)",
                borderRadius: "8px", display: "flex", alignItems: "center", gap: "8px"
              }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                {authError}
              </div>
            )}

            <button type="submit" disabled={authSubmitting}
              style={{ 
                padding: "14px", marginTop: "8px",
                background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)", 
                color: "#fff", border: "none", fontSize: "15px", fontWeight: 600, 
                cursor: "pointer", borderRadius: "12px", transition: "all 0.2s",
                boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)",
                opacity: authSubmitting ? 0.7 : 1,
                transform: authSubmitting ? "scale(0.98)" : "scale(1)"
              }}
              onMouseOver={(e) => { if (!authSubmitting) e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 16px rgba(37, 99, 235, 0.4)"; }}
              onMouseOut={(e) => { if (!authSubmitting) e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(37, 99, 235, 0.3)"; }}
              onMouseDown={(e) => { if (!authSubmitting) e.currentTarget.style.transform = "scale(0.98)"; }}
              onMouseUp={(e) => { if (!authSubmitting) e.currentTarget.style.transform = "translateY(-1px)"; }}
            >
              {authSubmitting ? "Processing..." : authMode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <div style={{ marginTop: "32px", textAlign: "center", fontSize: "14px", color: "var(--text-muted)" }}>
            {authMode === "login" ? "Don't have an account? " : "Already have an account? "}
            <span onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setAuthError(""); }}
              style={{ color: "#60a5fa", cursor: "pointer", fontWeight: 500, transition: "color 0.2s" }}
              onMouseOver={(e) => e.currentTarget.style.color = "#93c5fd"}
              onMouseOut={(e) => e.currentTarget.style.color = "#60a5fa"}
            >
              {authMode === "login" ? "Sign Up" : "Log In"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-text">QueryAI</div>
          <div className="sidebar-logo-sub">SQL Assistant</div>
        </div>

        <div style={{ margin: "0 16px 8px", padding: "12px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.2)", borderRadius: "12px", fontSize: "12px" }}>
          <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px", overflow: "hidden", textOverflow: "ellipsis" }}>{authUser.email}</div>
          {tokenUsage && (
            <div style={{ color: "var(--text-muted)", marginTop: "4px", fontSize: "11px" }}>
              Tokens: {tokenUsage.tokens_used_today.toLocaleString()} / {tokenUsage.token_cap.toLocaleString()}
            </div>
          )}
          <button 
            onClick={handleLogout} 
            style={{ 
              marginTop: "12px", padding: "6px 12px", fontSize: "12px", fontWeight: 500,
              background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", 
              color: "#fca5a5", cursor: "pointer", borderRadius: "8px", width: "100%",
              transition: "all 0.2s"
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.2)"; e.currentTarget.style.color = "#fecaca"; }}
            onMouseOut={(e) => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)"; e.currentTarget.style.color = "#fca5a5"; }}
          >
            Sign Out
          </button>
        </div>

        {}
        <div style={{ margin: "0 16px 16px", padding: "12px", border: "1px solid var(--border)", background: "var(--bg-card)", fontSize: "12px" }}>
          <div style={{ fontWeight: 600, color: dbStatus.connected ? "var(--green)" : "var(--text-secondary)", marginBottom: "4px" }}>
            {connectingDB ? "Connecting..." : dbStatus.connected ? "Database Connected" : "No Database"}
          </div>
          {dbStatus.connected && <div style={{ color: "var(--text-muted)" }}>SQLite (Local Demo)</div>}
          {!dbStatus.connected && !connectingDB && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <button className="db-status-btn" onClick={() => connectDB()} data-tooltip="Connect to demo DB">
                Connect Demo SQLite DB
              </button>
              
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>OR CONNECT CUSTOM POSTGRES DB:</div>
                <input 
                  type="text" 
                  placeholder="postgres://user:pass@host/db" 
                  value={customDbUrl}
                  onChange={e => setCustomDbUrl(e.target.value)}
                  style={{ width: "100%", background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)", padding: "6px 8px", fontSize: "11px", borderRadius: "var(--radius-sm)", marginBottom: "8px" }}
                />
                <button className="db-status-btn" onClick={() => { if(customDbUrl.trim()) connectDB(customDbUrl); }} style={{ width: "100%" }} data-tooltip="Connect Custom DB">
                  Connect Custom Database
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="sidebar-section-title">Navigation</div>
        {navItems.map(item => (
          <div key={item.id} className={`sidebar-item ${sidebarItem === item.id ? "active" : ""}`}
            onClick={() => { setSidebarItem(item.id); setMode(item.id as Mode); }}
            data-tooltip={`Open ${item.label}`}>
            {item.label}
          </div>
        ))}

        <div className="sidebar-divider" />
        <div className="sidebar-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Chat History
          <button onClick={createNewSession} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '18px', padding: '0 4px' }} title="New Chat">+</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '0 8px', overflowY: 'auto', maxHeight: '30vh' }}>
          {sessions.map(s => (
            <div key={s.id} className={`sidebar-item ${activeSessionId === s.id && sidebarItem === "chat" ? "active" : ""}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px' }}>
              {editingSessionId === s.id ? (
                <input 
                  value={editSessionName} 
                  autoFocus
                  onChange={e => setEditSessionName(e.target.value)} 
                  onBlur={() => renameSession(s.id, editSessionName)}
                  onKeyDown={e => { if(e.key === 'Enter') renameSession(s.id, editSessionName); }}
                  style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '2px 4px', fontSize: '13px' }}
                />
              ) : (
                <>
                  <div onClick={() => loadSession(s.id)} style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px' }}>
                    {s.name}
                  </div>
                  <div style={{ display: 'flex', gap: '2px' }}>
                    <button onClick={(e) => { e.stopPropagation(); setEditSessionName(s.name); setEditingSessionId(s.id); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 2px', fontSize: '12px' }} title="Rename Chat">✏️</button>
                    <button onClick={(e) => deleteSession(s.id, e)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 2px', fontSize: '12px' }} title="Delete Chat">🗑️</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </aside>

      {}
      <div className="main-content">
        <div className="topbar">
          <div className="topbar-title">
            {mode === "chat" && "Chat Assistant"}
            {mode === "nlp" && "English to SQL"}
            {mode === "analyze" && "SQL Analyzer"}
            {mode === "editor" && "SQL Editor"}
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: dbStatus.connected ? 'var(--green)' : 'var(--red)', fontSize: '14px' }}>●</span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{dbStatus.type === 'postgres' ? 'Supabase' : 'SQLite'}</span>
            </div>
            <input 
              type="password" 
              placeholder="Paste DB URL & Press Enter..." 
              value={customDbUrl}
              onChange={(e) => setCustomDbUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customDbUrl.trim()) {
                  connectDB(customDbUrl.trim());
                  setCustomDbUrl(""); // clear after sending
                }
              }}
              style={{
                background: 'var(--bg-primary)', border: '1px solid var(--border)', 
                color: 'var(--text-primary)', padding: '4px 8px', fontSize: '12px', 
                borderRadius: 'var(--radius)', width: '200px'
              }}
              title="Securely connect to your own PostgreSQL/Supabase database. Password will be hidden."
            />
            <div className="topbar-badge">LLM Connected</div>
          </div>
        </div>

        {mode === "chat" && (
          <>
            <div className="chat-area">
              {messages.length === 0 ? (
                <div className="welcome-screen">
                  <h1 className="welcome-title">QueryAI</h1>
                  <p className="welcome-subtitle">A tool that writes, explains, and fixes SQL queries for you. Ask a question or paste a query below to get started.</p>
                  
                  <div className="concrete-result-card">
                    <div className="concrete-result-header">Example: Finding the most recent order for each user</div>
                    <div className="concrete-result-body">
{`SELECT user_id, MAX(created_at) as last_order_date
FROM orders
WHERE status = 'completed'
GROUP BY user_id
ORDER BY last_order_date DESC
LIMIT 5;

-- Analysis: O(N log N) time complexity due to GROUP BY and ORDER BY. 
-- Quality score: 90/100.`}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((msg, i) => (
                    <div key={i} className={`message ${msg.role}`}>
                      <div className="message-label">{msg.role === "user" ? "You" : "QueryAI"}</div>
                      <div className="message-bubble" style={msg.content.startsWith("Error:") ? { borderColor: "var(--red)", background: "rgba(239, 68, 68, 0.05)" } : {}}>
                        {msg.content.startsWith("Error:") ? (
                          <div style={{ color: "var(--red)", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>⚠️</span> {msg.content}
                          </div>
                        ) : (
                          <MdRenderer content={msg.content} />
                        )}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="message assistant">
                      <div className="message-label">QueryAI</div>
                      <div className="message-bubble" style={{ background: "transparent", border: "none", padding: "16px 0" }}>
                        <div className="skeleton-loader skeleton-line"></div>
                        <div className="skeleton-loader skeleton-line"></div>
                        <div className="skeleton-loader skeleton-line short"></div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </>
              )}
            </div>
            <div className="input-area">

              <div className="input-wrapper">
                <textarea ref={textareaRef} className="input-textarea"
                  placeholder="Ask a question about SQL or databases... (Press Enter to send)"
                  value={input} onChange={e => { setInput(e.target.value); autoResize(); }}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  rows={1} />
                <button className="send-btn" onClick={() => sendMessage()} disabled={!input.trim() || loading} data-tooltip="Send message">
                  {loading ? "Sending..." : "Send"}
                </button>
              </div>
              <div className="input-hint">Shift+Enter for a new line</div>
            </div>
          </>
        )}

        {mode === "nlp" && (
          <>
            <div className="chat-area" style={{ padding: "32px", gap: "24px" }}>
              <div style={{ display: "flex", gap: "16px", marginBottom: "8px" }}>
                {[
                  { id: "nlp-to-sql", label: "English to SQL", desc: "Convert text to query" },
                  { id: "suggest", label: "Query Suggester", desc: "Compare query options" },
                ].map(opt => (
                  <div key={opt.id} onClick={() => setNlpMode(opt.id as any)}
                    style={{ flex: 1, padding: "16px", border: `1px solid ${nlpMode === opt.id ? "var(--text-primary)" : "var(--border)"}`, background: "var(--bg-card)", cursor: "pointer" }}>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>{opt.label}</div>
                    <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>{opt.desc}</div>
                  </div>
                ))}
              </div>

              {dbStatus.connected && (
                <div style={{ border: "1px solid var(--border)", padding: "12px 16px", fontSize: "13px", color: "var(--text-secondary)", background: "var(--bg-card)" }}>
                  Schema context active. The AI will use your connected database schema.
                </div>
              )}

              <div>
                <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "12px" }}>
                  Write your requirement
                </div>
                <div className="input-wrapper" style={{ alignItems: "flex-start", padding: 0 }}>
                  <textarea className="input-textarea"
                    style={{ minHeight: "100px", padding: "16px" }}
                    placeholder={nlpMode === "nlp-to-sql"
                      ? "Find all active users who signed up in the last 30 days..."
                      : "How should I structure a query to join users and orders tables?"}
                    value={nlpInput}
                    onChange={e => setNlpInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) runNLP(); }}
                    rows={4} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px" }}>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Press Ctrl+Enter to generate</div>
                  <button className="action-btn primary" onClick={runNLP} disabled={!nlpInput.trim() || nlpLoading} data-tooltip="Generate SQL from text">
                    {nlpLoading ? "Generating..." : "Generate SQL"}
                  </button>
                </div>
              </div>

              {!nlpResult && (
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "12px" }}>Examples</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {[
                      "List students with marks over 80, sorted by highest marks.",
                      "Find students enrolled in more than 2 courses.",
                      "Show the average marks for each department.",
                      "Identify courses that have zero enrollments.",
                    ].map((ex, i) => (
                      <div key={i} onClick={() => setNlpInput(ex)}
                        style={{ padding: "12px 16px", background: "var(--bg-card)", border: "1px solid var(--border)", fontSize: "13px", color: "var(--text-secondary)", cursor: "pointer" }}>
                        {ex}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {nlpLoading && (
                <div style={{ marginTop: "24px", background: "var(--bg-card)", border: "1px solid var(--border)", padding: "24px" }}>
                  <div className="skeleton-loader skeleton-line"></div>
                  <div className="skeleton-loader skeleton-line"></div>
                  <div className="skeleton-loader skeleton-block" style={{ marginTop: "16px", height: "120px" }}></div>
                </div>
              )}
              
              {nlpResult && (
                <div style={{ 
                  background: nlpResult.startsWith("Error:") ? "rgba(239, 68, 68, 0.05)" : "var(--bg-card)", 
                  border: nlpResult.startsWith("Error:") ? "1px solid var(--red)" : "1px solid var(--border)", 
                  padding: "24px", 
                  borderRadius: "var(--radius)" 
                }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: nlpResult.startsWith("Error:") ? "var(--red)" : "var(--text-secondary)", marginBottom: "16px" }}>
                    {nlpResult.startsWith("Error:") ? "⚠️ System Error" : "Result"}
                  </div>
                  <div style={{ padding: 0, margin: 0 }}>
                    {nlpResult.startsWith("Error:") ? (
                      <div style={{ color: "var(--red)" }}>{nlpResult}</div>
                    ) : (
                      <MdRenderer content={nlpResult} />
                    )}
                  </div>
                  {!nlpResult.startsWith("Error:") && (() => {
                    const sqlMatches = [...nlpResult.matchAll(/```sql\n([\s\S]*?)```/g)];
                    return (
                      <div style={{ display: "flex", gap: "12px", marginTop: "24px", borderTop: "1px solid var(--border)", paddingTop: "16px", flexWrap: "wrap", alignItems: "center" }}>
                        <button className="action-btn" onClick={() => setNlpResult("")}>Clear</button>
                        {sqlMatches.length === 1 && (
                          <>
                            <button className="action-btn primary" onClick={() => {
                              setSqlCode(sqlMatches[0][1]); setMode("editor"); setSidebarItem("editor"); setTimeout(() => runSQL(sqlMatches[0][1]), 100);
                            }} data-tooltip="Run generated query">Run Output</button>
                            <button className="action-btn" onClick={() => {
                              setSqlCode(sqlMatches[0][1]); setMode("analyze"); setSidebarItem("analyze"); setTimeout(() => analyzeSQL(sqlMatches[0][1]), 100);
                            }}>Analyze Output</button>
                          </>
                        )}
                        {sqlMatches.length > 1 && sqlMatches.map((m, idx) => (
                          <div key={idx} style={{display: 'flex', gap: '8px', borderLeft: '2px solid var(--border)', paddingLeft: '12px', marginLeft: '4px'}}>
                            <button className="action-btn primary" onClick={() => {
                              setSqlCode(m[1]); setMode("editor"); setSidebarItem("editor"); setTimeout(() => runSQL(m[1]), 100);
                            }}>Run Option {idx + 1}</button>
                            <button className="action-btn" onClick={() => {
                              setSqlCode(m[1]); setMode("analyze"); setSidebarItem("analyze"); setTimeout(() => analyzeSQL(m[1]), 100);
                            }}>Analyze Option {idx + 1}</button>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {nlpSuggestions && (
                <div style={{ background: "rgba(234, 179, 8, 0.1)", border: "1px solid var(--yellow-dark)", padding: "24px", borderRadius: "12px", marginTop: "-8px" }}>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--yellow)", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span>⚠️</span> Low Quality Detected - Suggested Alternatives
                  </div>
                  <div style={{ padding: 0, margin: 0 }}>
                    <MdRenderer content={nlpSuggestions} />
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {mode === "analyze" && (
          <>
            <div className="chat-area" style={{ padding: "32px", gap: "24px" }}>
              <div className="editor-section">
                <div className="editor-header">
                  <span className="editor-title">SQL Query to Analyze</span>
                  <div className="editor-actions">
                    <button className="action-btn" onClick={() => setSqlCode("")}>Clear</button>
                    <button className="action-btn primary" onClick={() => analyzeSQL()} disabled={analyzing} data-tooltip="Run query analysis">
                      {analyzing ? "Analyzing..." : "Analyze Query"}
                    </button>
                  </div>
                </div>
                <MonacoEditor height="200px" language="sql" theme="vs-dark" value={sqlCode}
                  onChange={v => setSqlCode(v || "")}
                  options={{ minimap: { enabled: false }, fontSize: 14, fontFamily: "JetBrains Mono, monospace", lineNumbers: "on", padding: { top: 16 } }} />
              </div>

              {analyzing && (
                <div className="analysis-panel">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="analysis-card" style={{ padding: "20px" }}>
                      <div className="skeleton-loader skeleton-line short"></div>
                      <div className="skeleton-loader skeleton-block" style={{ marginTop: "16px" }}></div>
                    </div>
                  ))}
                </div>
              )}

              {analysisResult && (
                <div className="analysis-panel">
                  {analysisResult.classification && (
                    <div className="analysis-card">
                      <div className="analysis-card-title" style={{ marginBottom: "16px" }}>Query Type</div>
                      <div className="analysis-card-value">{analysisResult.classification.sub_type}</div>
                      <div className="analysis-card-label">{analysisResult.classification.category_full}</div>
                      <div style={{ marginTop: "12px", fontSize: "13px", color: "var(--text-muted)" }}>{analysisResult.classification.description}</div>
                    </div>
                  )}

                  {analysisResult.complexity && (
                    <div className="analysis-card">
                      <div className="analysis-card-title" style={{ marginBottom: "16px" }}>Time Complexity</div>
                      <div className="analysis-card-value">{analysisResult.complexity.complexity}</div>
                      <div className="analysis-card-label">{analysisResult.complexity.complexity_label}</div>
                      <div className="score-bar">
                        <div className="score-bar-fill" style={{ width: `${(analysisResult.complexity.score / 5) * 100}%` }} />
                      </div>
                    </div>
                  )}

                  {analysisResult.rows_affected && (
                    <div className="analysis-card">
                      <div className="analysis-card-title" style={{ marginBottom: "16px" }}>Row Prediction</div>
                      <div className="analysis-card-value">~{analysisResult.rows_affected.estimated_rows.toLocaleString()}</div>
                      <div className="analysis-card-label">{analysisResult.rows_affected.impact}</div>
                      {analysisResult.rows_affected.warning && (
                        <div className="warning-banner">{analysisResult.rows_affected.warning}</div>
                      )}
                    </div>
                  )}

                  {analysisResult.quality && (
                    <div className="analysis-card">
                      <div className="analysis-card-title" style={{ marginBottom: "16px" }}>Code Quality Score</div>
                      <div className="analysis-card-value">{analysisResult.quality.score} / 100</div>
                      <div className="analysis-card-label">{analysisResult.quality.grade_label}</div>
                      <div className="score-bar">
                        <div className="score-bar-fill" style={{ width: `${analysisResult.quality.score}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="input-area">

              <div className="input-wrapper">
                <textarea ref={textareaRef} className="input-textarea"
                  placeholder="Paste SQL here to analyze..."
                  value={input} onChange={e => { setInput(e.target.value); autoResize(); }}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (input.trim()) { const q = input.trim(); setSqlCode(q); setInput(""); setTimeout(() => analyzeSQL(q), 100); }
                    }
                  }} rows={1} />
                <button className="send-btn" onClick={() => { if (input.trim()) { const q = input.trim(); setSqlCode(q); setInput(""); setTimeout(() => analyzeSQL(q), 100); } else analyzeSQL(); }} disabled={analyzing} data-tooltip="Analyze input">
                  {analyzing ? "..." : "Analyze"}
                </button>
              </div>
            </div>
          </>
        )}

        {mode === "editor" && (
          <>
            <div className="chat-area" style={{ padding: "32px", gap: "24px" }}>
              <div className="editor-section" style={{ flex: 1 }}>
                <div className="editor-header">
                  <span className="editor-title">SQL Editor</span>
                  <div className="editor-actions">
                    <button className="action-btn" onClick={() => setSqlCode("")}>Clear</button>
                    <button className="action-btn primary" onClick={() => runSQL()} disabled={executing} data-tooltip="Execute query against DB">
                      {executing ? "Running..." : "Run Query"}
                    </button>
                    <button className="action-btn" onClick={() => { setMode("analyze"); setSidebarItem("analyze"); analyzeSQL(); }}>Analyze</button>
                    <button className="action-btn" onClick={() => { setMode("chat"); setSidebarItem("chat"); sendMessage(`Rewrite and optimize this SQL query:\n\`\`\`sql\n${sqlCode}\n\`\`\``); }} data-tooltip="Send to AI for optimization">
                      Optimize
                    </button>
                  </div>
                </div>
                <MonacoEditor height="400px" language="sql" theme="vs-dark" value={sqlCode}
                  onChange={v => setSqlCode(v || "")}
                  options={{ minimap: { enabled: false }, fontSize: 14, fontFamily: "JetBrains Mono, monospace", lineNumbers: "on", padding: { top: 16 } }} />
              </div>

              {executionResult && (
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 600, fontSize: "14px" }}>Execution Results</div>
                    <div style={{ fontSize: "12px", color: executionResult.status === "error" ? "var(--red)" : "var(--green)" }}>{executionResult.message || executionResult.error}</div>
                  </div>
                  {executionResult.columns && executionResult.data && executionResult.data.length > 0 ? (
                    <div style={{ overflowX: 'auto', maxHeight: '300px', overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                        <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1 }}>
                          <tr>
                            {executionResult.columns.map((c, i) => (
                              <th key={i} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600, color: 'var(--text-secondary)' }}>{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {executionResult.data.map((row, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                              {executionResult.columns!.map((c, j) => (
                                <td key={j} style={{ padding: '8px 12px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{row[c] !== null ? String(row[c]) : <i style={{color:'var(--text-muted)'}}>NULL</i>}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : executionResult.status === "success" && executionResult.columns ? (
                    <div style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>No rows returned.</div>
                  ) : null}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                {[
                  { title: "Explain Query", action: () => { setMode("chat"); setSidebarItem("chat"); sendMessage(`Explain what this query does:\n\`\`\`sql\n${sqlCode}\n\`\`\``); } },
                  { title: "Check Quality", action: () => { setMode("chat"); setSidebarItem("chat"); sendMessage(`Review the code quality of this query:\n\`\`\`sql\n${sqlCode}\n\`\`\``); } },
                  { title: "List Tables Used", action: () => { setMode("chat"); setSidebarItem("chat"); sendMessage(`List all tables and columns used here:\n\`\`\`sql\n${sqlCode}\n\`\`\``); } },
                  { title: "Check Permissions", action: () => { setMode("chat"); setSidebarItem("chat"); sendMessage(`What database permissions are required for this query?\n\`\`\`sql\n${sqlCode}\n\`\`\``); } },
                ].map((btn, i) => (
                  <button key={i} className="action-btn" style={{ padding: "12px", fontSize: "13px" }} onClick={btn.action}>{btn.title}</button>
                ))}
              </div>

              {dbStatus.connected && (
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", padding: "20px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "12px" }}>Active Database Schema</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {["students (id, name, email, age, marks)", "courses (id, course_name, credits)", "enrollments (id, student_id, course_id)"].map((t, i) => (
                      <div key={i} style={{ border: "1px solid var(--border)", background: "var(--bg-secondary)", padding: "6px 12px", fontSize: "13px", color: "var(--text-secondary)" }}>
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="input-area">

            </div>
          </>
        )}
      </div>

      {}
      <aside className="right-panel">
        <div className="right-panel-tabs">
          {(["results", "analysis", "quality", "tables", "tips"] as PanelTab[]).map(tab => (
            <div key={tab} className={`panel-tab ${panelTab === tab ? "active" : ""}`} onClick={() => setPanelTab(tab)} style={{ textTransform: "capitalize" }}>
              {tab}
            </div>
          ))}
        </div>

        <div className="panel-content">
          {panelTab === "results" && (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "16px" }}>Execution Results</div>
              {executing ? (
                <div style={{ color: "var(--text-muted)", fontSize: "14px" }}>Executing query...</div>
              ) : executionResult ? (
                executionResult.error || executionResult.status === "error" ? (
                  <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", padding: "16px", borderRadius: "8px", color: "#fca5a5", fontSize: "13px" }}>
                    {executionResult.error || executionResult.message || "Failed to execute query."}
                  </div>
                ) : executionResult.columns && executionResult.data && executionResult.data.length > 0 ? (
                  <div style={{ overflowX: "auto", overflowY: "auto", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "8px", flex: 1 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
                      <thead style={{ position: "sticky", top: 0, background: "var(--bg-secondary)", zIndex: 1 }}>
                        <tr>
                          {executionResult.columns.map((col, idx) => (
                            <th key={idx} style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", fontWeight: 600, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {executionResult.data.map((row, rowIdx) => (
                          <tr key={rowIdx} style={{ borderBottom: "1px solid var(--border)", transition: "background 0.2s" }} onMouseOver={(e) => e.currentTarget.style.background = "var(--bg-secondary)"} onMouseOut={(e) => e.currentTarget.style.background = "transparent"}>
                            {executionResult.columns!.map((col, colIdx) => (
                              <td key={colIdx} style={{ padding: "10px 16px", color: "var(--text-primary)", whiteSpace: "nowrap", borderRight: "1px solid var(--border)" }}>
                                {row[col] !== null ? String(row[col]) : <i style={{color: "var(--text-muted)"}}>NULL</i>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ color: "var(--text-muted)", fontSize: "14px", padding: "24px", textAlign: "center", background: "var(--bg-card)", border: "1px dashed var(--border)", borderRadius: "8px" }}>
                    Query executed successfully. No rows returned.
                  </div>
                )
              ) : (
                <div style={{ color: "var(--text-muted)", fontSize: "14px", marginTop: "24px" }}>
                  Ask a question in chat to auto-generate and execute a query.
                </div>
              )}
            </div>
          )}

          {panelTab === "analysis" && (
            analyzing ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "24px", marginTop: "24px" }}>
                <div className="skeleton-loader skeleton-line" style={{ height: "80px", borderRadius: "8px" }}></div>
                <div className="skeleton-loader skeleton-line" style={{ height: "120px", borderRadius: "8px" }}></div>
                <div className="skeleton-loader skeleton-line" style={{ height: "80px", borderRadius: "8px" }}></div>
              </div>
            ) : !analysisResult ? (
              <div style={{ color: "var(--text-muted)", fontSize: "14px", marginTop: "40px" }}>
                Run an analysis to see details here.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                {analysisResult.classification && (
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "8px" }}>Classification</div>
                    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", padding: "16px" }}>
                      <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>{analysisResult.classification.category} - {analysisResult.classification.sub_type}</div>
                      <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>{analysisResult.classification.description}</div>
                    </div>
                  </div>
                )}
                {analysisResult.complexity && (
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "8px" }}>Complexity</div>
                    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", padding: "16px" }}>
                      <div style={{ fontSize: "20px", fontWeight: 500, fontFamily: "JetBrains Mono, monospace", marginBottom: "8px" }}>{analysisResult.complexity.complexity}</div>
                      <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "12px" }}>{analysisResult.complexity.complexity_label}</div>
                      <div className="score-bar">
                        <div className="score-bar-fill" style={{ width: `${(analysisResult.complexity.score / 5) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                )}
                {analysisResult.rows_affected && (
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "8px" }}>Row Estimate</div>
                    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", padding: "16px" }}>
                      <div style={{ fontSize: "20px", fontWeight: 500, fontFamily: "JetBrains Mono, monospace", marginBottom: "8px" }}>~{analysisResult.rows_affected.estimated_rows.toLocaleString()}</div>
                      <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>{analysisResult.rows_affected.impact}</div>
                    </div>
                  </div>
                )}
              </div>
            )
          )}

          {panelTab === "quality" && (
            analyzing ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "24px", marginTop: "24px" }}>
                <div className="skeleton-loader skeleton-line" style={{ height: "150px", borderRadius: "8px" }}></div>
                <div className="skeleton-loader skeleton-line" style={{ height: "60px", borderRadius: "8px" }}></div>
              </div>
            ) : !analysisResult?.quality ? (
              <div style={{ color: "var(--text-muted)", fontSize: "14px", marginTop: "40px" }}>
                Run an analysis to calculate a code quality score.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", padding: "24px", textAlign: "center" }}>
                  <div style={{ fontSize: "48px", fontWeight: 600, fontFamily: "JetBrains Mono, monospace", marginBottom: "8px" }}>{analysisResult.quality.score}</div>
                  <div style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "4px" }}>Score / 100</div>
                  <div style={{ fontSize: "16px", fontWeight: 500 }}>{analysisResult.quality.grade_label}</div>
                  <div className="score-bar" style={{ marginTop: "16px" }}>
                    <div className="score-bar-fill" style={{ width: `${analysisResult.quality.score}%` }} />
                  </div>
                </div>
                
                {analysisResult.quality.deductions.length > 0 && (
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "12px" }}>Issues Found</div>
                    {analysisResult.quality.deductions.map((d, i) => (
                      <div key={i} style={{ border: "1px solid var(--border)", padding: "12px", marginBottom: "8px", background: "var(--bg-card)", fontSize: "13px" }}>
                        <div style={{ fontWeight: 600, marginBottom: "4px" }}>-{d.deducted} points: {d.criterion}</div>
                        <div style={{ color: "var(--text-secondary)" }}>{d.tip}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          )}

          {panelTab === "tables" && (
            !analysisResult?.tables_info ? (
              <div style={{ color: "var(--text-muted)", fontSize: "14px", marginTop: "40px" }}>
                Run an analysis to extract table information.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", padding: "16px" }}>
                  <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                    Tables: {analysisResult.tables_info.total_tables} &bull; Joins: {analysisResult.tables_info.total_joins}
                  </div>
                </div>
                {analysisResult.tables_info.tables.map((table, i) => (
                  <div key={i} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", padding: "16px" }}>
                    <div style={{ fontWeight: 600, fontSize: "14px", marginBottom: "8px" }}>{table}</div>
                    {analysisResult.tables_info!.columns_by_table[table]?.length > 0 ? (
                      <div className="operations-list">
                        {analysisResult.tables_info!.columns_by_table[table].map((col, j) => (
                          <span key={j} className="op-pill">{col}</span>
                        ))}
                      </div>
                    ) : <div className="operations-list"><span className="op-pill" style={{ background: "transparent", border: "1px dashed var(--border)", color: "var(--text-muted)" }}>* (All Columns)</span></div>}
                  </div>
                ))}
              </div>
            )
          )}

          {panelTab === "tips" && (
            <div className="tips-list">
              {[
                "Index columns used in WHERE, JOIN, and ORDER BY",
                "Specify required columns instead of using SELECT *",
                "Add a LIMIT clause to restrict large result sets",
                "Use EXPLAIN ANALYZE before deploying queries",
                "Prefer JOIN statements over subqueries for performance",
                "Use CTEs (WITH clause) to structure complex queries",
                "Use parameterized queries to prevent SQL injection",
                "Keep transactions short and use BEGIN/COMMIT",
              ].map((item, i) => (
                <div key={i} className="tip-item">
                  <div style={{ width: "16px", color: "var(--text-secondary)" }}>&bull;</div>
                  <div>{item}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

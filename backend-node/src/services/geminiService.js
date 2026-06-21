const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

if (!process.env.GEMINI_API_KEY) {
    console.warn("WARNING: GEMINI_API_KEY is missing in the environment variables!");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const SYSTEM_PROMPT = `You are QueryAI — an expert SQL and Database Management System (DBMS) assistant.

STRICT RULES:
1. ONLY answer SQL, DBMS, and database-related questions. Decline anything else politely.
2. ALWAYS write SQL in UPPERCASE keywords (SELECT, FROM, WHERE, etc.)
3. ALWAYS write clean, properly indented, industry-standard SQL code.
4. ALWAYS prefer JOINs over subqueries unless subquery is clearly better.
5. ALWAYS add comments explaining non-obvious parts of complex queries.
6. NEVER use SELECT * — always specify columns.
7. ALWAYS suggest indexes when relevant.
8. Format SQL in proper code blocks with \`\`\`sql markers.

You can help with: SELECT/INSERT/UPDATE/DELETE, DDL (CREATE/ALTER/DROP), DCL (GRANT/REVOKE),
TCL (COMMIT/ROLLBACK), JOINs, CTEs, Window Functions, Stored Procedures, Triggers,
Query Optimization, Normalization, Indexing, EXPLAIN plans, ERD design.`;

const chatWithGemini = async (userMessage, history = [], schema = "") => {
    try {
        const chatHistory = history.map(msg => ({
            role: msg.role === "user" ? "user" : "model",
            parts: [{ text: msg.content || "" }]
        }));
        
        const schemaCtx = schema ? `\n\nCurrent Database Schema:\n${schema}` : "";
        
        const chatModel = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash", 
            systemInstruction: `${SYSTEM_PROMPT}${schemaCtx}` 
        });
        
        const chat = chatModel.startChat({ history: chatHistory });
        const result = await chat.sendMessage(userMessage);
        return result.response.text();
    } catch (error) {
        return `Error: ${error.message}`;
    }
};

const nlpToSql = async (naturalLanguage, schema = "") => {
    const schemaCtx = schema ? `\n\nDatabase Schema:\n${schema}` : "";
    const prompt = `${SYSTEM_PROMPT}${schemaCtx}

The user has described a requirement in natural language. Convert it to SQL.

REQUIREMENT: ${naturalLanguage}

Provide your response in this format:
If the requirement is simple and unambiguous, provide:
## Generated SQL
\`\`\`sql
-- Your query
\`\`\`
## Explanation
(Brief 1-2 sentence explanation)

If the requirement is complex, ambiguous, or has multiple distinct approaches (e.g., JOIN vs Subquery), provide 2-3 alternatives:
## Option 1: [Name] (Recommended)
\`\`\`sql
-- Your query
\`\`\`
**Explanation:** (Brief explanation)

## Option 2: [Name]
\`\`\`sql
-- Your query
\`\`\`
**Explanation:** (Brief explanation)

IMPORTANT: Keep explanations extremely short and concise. No conversational filler.`;

    try {
        const result = await model.generateContent(prompt);
        return { response: result.response.text(), status: "success" };
    } catch (error) {
        return { response: `Error: ${error.message}`, status: "error" };
    }
};

const suggestBestQuery = async (requirement, schema = "") => {
    const schemaCtx = schema ? `\n\nDatabase Schema:\n${schema}` : "";
    const prompt = `${SYSTEM_PROMPT}${schemaCtx}

A user wants to accomplish something in their database. Suggest the BEST query approach.

REQUIREMENT: ${requirement}

Provide 2-3 different query options with pros/cons:

## Option 1: [Name] (Recommended ✅)
\`\`\`sql
-- Option 1 SQL
\`\`\`
**Pros:** ...
**Cons:** ...
**Best when:** ...

## Option 2: [Name]
\`\`\`sql
-- Option 2 SQL  
\`\`\`
**Pros:** ...
**Cons:** ...
**Best when:** ...

## Recommendation
Which option to use and why, considering performance, readability, and maintainability.`;

    try {
        const result = await model.generateContent(prompt);
        return { response: result.response.text(), status: "success" };
    } catch (error) {
        return { response: `Error: ${error.message}`, status: "error" };
    }
};

const explainSimple = async (sql) => {
    const prompt = `Explain this SQL query in VERY SIMPLE language that a complete beginner can understand.
No technical jargon. Use analogies and plain words.

\`\`\`sql
${sql}
\`\`\`

Structure your explanation as:
## 🎯 What does this query do?
(1-2 sentences, plain English)

## 📖 Step-by-step breakdown
(Explain each part simply, like explaining to a 10-year-old)

## 📊 What will you get back?
(Describe the result/output simply)

## ⚠️ Things to watch out for
(Any gotchas, edge cases, or important warnings in simple terms)`;

    try {
        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (error) {
        return `Error: ${error.message}`;
    }
};

const optimizeQuery = async (sql, schema = "") => {
    const schemaCtx = schema ? `\n\nDatabase Schema:\n${schema}` : "";
    const prompt = `${SYSTEM_PROMPT}${schemaCtx}

Analyze and optimize this SQL query. Rewrite it in industry-standard format.

Original Query:
\`\`\`sql
${sql}
\`\`\`

Provide:
## 🔍 Issues Found
List all problems with the original query

## ✅ Optimized Query
\`\`\`sql
-- Optimized, industry-standard version with comments
\`\`\`

## 📋 Changes Made
Explain each change and why it improves the query

## 🗂️ Index Recommendations
What indexes would help this query

## 📊 Expected Performance Improvement
Rough estimate of improvement`;

    try {
        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (error) {
        return `Error: ${error.message}`;
    }
};

const generateIndustryStandardSql = async (requirement, schema = "") => {
    const schemaCtx = schema ? `\n\nSchema:\n${schema}` : "";
    const prompt = `${SYSTEM_PROMPT}${schemaCtx}

Generate a clean, industry-standard SQL query for:
${requirement}

Requirements for the output:
- UPPERCASE SQL keywords
- Proper indentation (2 or 4 spaces)
- Meaningful column aliases
- Inline comments for complex parts
- No SELECT *
- Optimized for performance
- Follow ANSI SQL standards

Just provide the SQL query with brief explanation.`;

    try {
        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (error) {
        return `Error: ${error.message}`;
    }
};

module.exports = {
    chatWithGemini,
    nlpToSql,
    suggestBestQuery,
    explainSimple,
    optimizeQuery,
    generateIndustryStandardSql
};

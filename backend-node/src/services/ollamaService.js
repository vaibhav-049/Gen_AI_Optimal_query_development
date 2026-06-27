const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

const CODE_MODEL = 'qwen2.5-coder:3b';
const CHAT_MODEL = 'qwen3:8b';

const callOllama = async (model, prompt, options = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                prompt,
                stream: false,
                options: { temperature: 0.3, num_predict: 2048, ...options }
            }),
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
        const data = await res.json();
        return data.response || '';
    } catch (error) {
        clearTimeout(timeout);
        throw error;
    }
};

const chatWithOllama = async (userMessage, history = [], schema = '', dialect = 'SQL') => {
    const schemaCtx = schema ? `\nDatabase Schema:\n${schema}` : '';
    const historyText = history.slice(-6).map(m =>
        `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
    ).join('\n');

    const prompt = `You are QueryAI — an expert ${dialect} assistant. ONLY answer ${dialect} and database questions. Decline anything else.
Rules: UPPERCASE keywords, no SELECT *, proper indentation, suggest indexes when relevant.
${schemaCtx}

${historyText ? `Previous conversation:\n${historyText}\n` : ''}
User: ${userMessage}
Assistant:`;

    return await callOllama(CHAT_MODEL, prompt);
};

const nlpToSqlOllama = async (naturalLanguage, schema = '', dialect = 'SQL') => {
    const schemaCtx = schema ? `\nDatabase Schema:\n${schema}` : '';

    const prompt = `/think
You are an expert ${dialect} assistant. Convert the following requirement to ${dialect}.${schemaCtx}

REQUIREMENT: ${naturalLanguage}

Output ONLY the ${dialect} query inside a \`\`\`sql code block (or \`\`\`json for MongoDB). Be direct and concise. Do not provide explanations or multiple options unless explicitly asked.`;

    try {
        const response = await callOllama(CODE_MODEL, prompt);
        return { response, status: 'success' };
    } catch (error) {
        throw new Error("Local AI Service is unreachable. Please ensure Ollama is running.");
    }
};

const explainSimpleOllama = async (sql) => {
    const prompt = `Explain this SQL query in simple language a beginner can understand. Be concise.

\`\`\`sql
${sql}
\`\`\`

Structure:
## What does this query do?
(1-2 sentences)
## Step-by-step
(Simple breakdown)
## Output
(What you get back)`;

    return await callOllama(CHAT_MODEL, prompt);
};

const optimizeQueryOllama = async (sql, schema = '', dialect = 'SQL') => {
    const schemaCtx = schema ? `\nSchema:\n${schema}` : '';
    const prompt = `/think
You are an expert ${dialect} optimization assistant.${schemaCtx}

Analyze and optimize this query:
\`\`\`sql
${sql}
\`\`\`

Provide: Issues Found, Optimized Query (in \`\`\`sql block), Changes Made, Index Recommendations.`;

    return await callOllama(CODE_MODEL, prompt);
};

const suggestBestQueryOllama = async (requirement, schema = '', dialect = 'SQL') => {
    const schemaCtx = schema ? `\nSchema:\n${schema}` : '';
    const prompt = `/think
You are an expert ${dialect} assistant.${schemaCtx}

Requirement: ${requirement}

Provide 2 ${dialect} query options with pros/cons. Label the best one as Recommended.
Output code in \`\`\`sql blocks.`;

    try {
        const response = await callOllama(CODE_MODEL, prompt);
        return { response, status: 'success' };
    } catch (error) {
        throw new Error("Local AI Service is unreachable. Please ensure Ollama is running.");
    }
};

const generateIndustryStandardOllama = async (requirement, schema = '', dialect = 'SQL') => {
    const schemaCtx = schema ? `\nSchema:\n${schema}` : '';
    const prompt = `Generate clean, industry-standard ${dialect} code for:${schemaCtx}

${requirement}

Rules: UPPERCASE keywords, proper indentation, meaningful aliases, no SELECT *, optimized. Output ONLY the ${dialect} code.`;

    return await callOllama(CODE_MODEL, prompt);
};

const isAvailable = async () => {
    try {
        const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
        return res.ok;
    } catch {
        return false;
    }
};

module.exports = {
    chatWithOllama,
    nlpToSqlOllama,
    explainSimpleOllama,
    optimizeQueryOllama,
    suggestBestQueryOllama,
    generateIndustryStandardOllama,
    isAvailable
};

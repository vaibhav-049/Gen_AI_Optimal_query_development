const ollamaService = require('./ollamaService');
const geminiService = require('./geminiService');
const userDb = require('./userDb');

const LLM_PRIMARY = process.env.LLM_PRIMARY || 'ollama';
let ollamaUp = null;

const checkOllama = async () => {
    if (ollamaUp !== null && Date.now() - ollamaUp.checkedAt < 30000) {
        return ollamaUp.available;
    }
    const available = await ollamaService.isAvailable();
    ollamaUp = { available, checkedAt: Date.now() };
    return available;
};

const estimateTokens = (text) => {
    return Math.ceil((text || '').length / 4);
};

const route = async (task, args, userId) => {
    const useOllamaFirst = LLM_PRIMARY === 'ollama';
    const ollamaAvailable = useOllamaFirst ? await checkOllama() : false;

    const ollamaFns = {
        chat: ollamaService.chatWithOllama,
        nlpToSql: ollamaService.nlpToSqlOllama,
        explainSimple: ollamaService.explainSimpleOllama,
        optimizeQuery: ollamaService.optimizeQueryOllama,
        suggestBestQuery: ollamaService.suggestBestQueryOllama,
        generateIndustryStandardSql: ollamaService.generateIndustryStandardOllama,
    };

    const geminiFns = {
        chat: geminiService.chatWithGemini,
        nlpToSql: geminiService.nlpToSql,
        explainSimple: geminiService.explainSimple,
        optimizeQuery: geminiService.optimizeQuery,
        suggestBestQuery: geminiService.suggestBestQuery,
        generateIndustryStandardSql: geminiService.generateIndustryStandardSql,
    };

    let result;
    let provider = 'unknown';

    if (ollamaAvailable && ollamaFns[task]) {
        try {
            result = await ollamaFns[task](...args);
            provider = 'ollama';
        } catch (err) {
            if (geminiFns[task]) {
                result = await geminiFns[task](...args);
                provider = 'gemini';
            } else {
                throw err;
            }
        }
    } else if (geminiFns[task]) {
        result = await geminiFns[task](...args);
        provider = 'gemini';
    } else {
        throw new Error(`Unknown LLM task: ${task}`);
    }

    if (userId && provider === 'gemini') {
        const responseText = typeof result === 'string' ? result : (result?.response || '');
        const inputText = args.map(a => typeof a === 'string' ? a : '').join(' ');
        const tokens = estimateTokens(inputText + responseText);
        try {
            await userDb.addTokenUsage(userId, tokens);
        } catch (e) {}
    }

    return result;
};

module.exports = { route, checkOllama, estimateTokens };

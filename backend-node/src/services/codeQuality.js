
const calculateCodeQuality = (sql) => {
    const sqlUpper = sql.trim().toUpperCase();
    const sqlLines = sql.trim().split('\n');
    const scores = {};
    const feedback = [];
    const deductions = [];

    
    if (/\bSELECT\s+\*/.test(sqlUpper)) {
        scores.no_select_star = 0;
        deductions.push({ criterion: "Avoid SELECT *", deducted: 10, tip: "Specify column names explicitly instead of SELECT *" });
    } else {
        scores.no_select_star = 10;
        feedback.push("✅ Specific columns selected (no SELECT *)");
    }

    
    const firstWord = sqlUpper.split(/\s+/)[0] || "";
    if (["UPDATE", "DELETE"].includes(firstWord)) {
        if (/\bWHERE\b/.test(sqlUpper)) {
            scores.where_clause = 10;
            feedback.push("✅ WHERE clause present on write operation");
        } else {
            scores.where_clause = 0;
            deductions.push({ criterion: "Missing WHERE clause", deducted: 10, tip: "Always use WHERE with UPDATE/DELETE to avoid affecting all rows" });
        }
    } else {
        scores.where_clause = 10;
    }

    
    const multiLine = sqlLines.length > 1;
    if (multiLine || sql.trim().length < 60) {
        scores.formatting = 10;
        feedback.push("✅ Query is properly formatted");
    } else {
        scores.formatting = 5;
        deductions.push({ criterion: "Formatting", deducted: 5, tip: "Break long queries into multiple lines for readability" });
    }

    
    if (/LIKE\s+'%/.test(sqlUpper)) {
        scores.no_leading_wildcard = 0;
        deductions.push({ criterion: "Leading wildcard LIKE", deducted: 10, tip: "Avoid LIKE '%value' — use 'value%' or full-text search instead" });
    } else {
        scores.no_leading_wildcard = 10;
        feedback.push("✅ No leading wildcard in LIKE");
    }

    
    const hasJoin = /\bJOIN\b/.test(sqlUpper);
    const hasAlias = /\bAS\b|\b[a-zA-Z]+\s+[a-zA-Z]\b/.test(sql);
    if (hasJoin && !hasAlias) {
        scores.aliases = 3;
        deductions.push({ criterion: "Table aliases missing", deducted: 5, tip: "Use table aliases (e.g. FROM students s) when using JOINs" });
    } else {
        scores.aliases = 8;
        if (hasAlias) feedback.push("✅ Aliases used for readability");
    }

    
    if (/WHERE\s+\w+\s+IN\s*\(\s*SELECT/.test(sqlUpper)) {
        scores.no_subquery_in_where = 4;
        deductions.push({ criterion: "Subquery in WHERE", deducted: 4, tip: "Consider replacing IN (SELECT ...) with a JOIN for better performance" });
    } else {
        scores.no_subquery_in_where = 8;
        feedback.push("✅ No inefficient subquery in WHERE");
    }

    
    if (firstWord === "SELECT" && !/\bLIMIT\b|\bTOP\b|\bFETCH\b/.test(sqlUpper)) {
        if (!/\bWHERE\b.*=\s*\d+/.test(sqlUpper)) {
            scores.limit = 4;
            deductions.push({ criterion: "No LIMIT clause", deducted: 4, tip: "Add LIMIT to SELECT queries to avoid fetching millions of rows" });
        } else {
            scores.limit = 8;
        }
    } else {
        scores.limit = 8;
        if (/\bLIMIT\b/.test(sqlUpper)) feedback.push("✅ LIMIT clause used");
    }

    
    const sqlKeywords = sql.match(/\b(select|from|where|join|on|group|order|having|insert|update|delete|create|drop|alter)\b/gi);
    if (sqlKeywords) {
        const upperCount = sqlKeywords.filter(k => k === k.toUpperCase()).length;
        const lowerCount = sqlKeywords.filter(k => k === k.toLowerCase()).length;
        const total = sqlKeywords.length;
        const consistent = Math.max(upperCount, lowerCount) / total;
        if (consistent >= 0.9) {
            scores.casing = 8;
            feedback.push("✅ Consistent keyword casing");
        } else {
            scores.casing = 4;
            deductions.push({ criterion: "Inconsistent casing", deducted: 4, tip: "Use consistent UPPERCASE for SQL keywords (industry standard)" });
        }
    } else {
        scores.casing = 8;
    }

    
    if (/FROM\s+\w+\s*,\s*\w+/.test(sqlUpper)) {
        scores.no_implicit_join = 0;
        deductions.push({ criterion: "Implicit JOIN (comma)", deducted: 8, tip: "Replace old-style comma joins (FROM a, b) with explicit JOIN syntax" });
    } else {
        scores.no_implicit_join = 8;
        feedback.push("✅ Explicit JOIN syntax used");
    }

    
    const queryLen = sql.trim().length;
    const joinCount = (sqlUpper.match(/\bJOIN\b/g) || []).length;
    const subqueryCount = Math.max(0, (sqlUpper.match(/\bSELECT\b/g) || []).length - 1);
    
    if (queryLen > 2000 || joinCount > 5 || subqueryCount > 3) {
        scores.complexity = 3;
        deductions.push({ criterion: "High complexity", deducted: 7, tip: "Consider breaking this query into CTEs or smaller queries" });
    } else if (queryLen > 800 || joinCount > 3) {
        scores.complexity = 6;
        deductions.push({ criterion: "Medium-high complexity", deducted: 4, tip: "Consider using CTEs (WITH clause) for complex multi-join queries" });
    } else {
        scores.complexity = 10;
        feedback.push("✅ Manageable query complexity");
    }

    let totalScore = Object.values(scores).reduce((a, b) => a + b, 0);

    
    let grade, gradeLabel, gradeColor;
    if (totalScore >= 90) {
        [grade, gradeLabel, gradeColor] = ["A+", "Excellent — Industry Standard", "#22c55e"];
    } else if (totalScore >= 80) {
        [grade, gradeLabel, gradeColor] = ["A", "Good — Production Ready", "#86efac"];
    } else if (totalScore >= 70) {
        [grade, gradeLabel, gradeColor] = ["B", "Average — Needs Minor Fixes", "#eab308"];
    } else if (totalScore >= 50) {
        [grade, gradeLabel, gradeColor] = ["C", "Below Average — Refactor Recommended", "#f97316"];
    } else {
        [grade, gradeLabel, gradeColor] = ["D", "Poor — Major Issues Found", "#ef4444"];
    }

    return {
        score: totalScore,
        max_score: 100,
        grade,
        grade_label: gradeLabel,
        grade_color: gradeColor,
        criteria_scores: scores,
        good_practices: feedback,
        deductions,
        summary: `Query scored ${totalScore}/100 — ${gradeLabel}`
    };
};

module.exports = {
    calculateCodeQuality
};

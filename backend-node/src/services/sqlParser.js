
const extractTablesAndColumns = (sql) => {
    const sqlUpper = sql.toUpperCase();
    
    
    const tableRegex = /(?:FROM|JOIN|INTO|UPDATE)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:AS\s+[a-zA-Z_]\w*)?/g;
    const tablesRaw = [];
    let match;
    while ((match = tableRegex.exec(sqlUpper)) !== null) {
        tablesRaw.push(match[1]);
    }

    
    const aliasMap = {};
    const aliasRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\s+(?:AS\s+)?([a-zA-Z_])\b/g;
    while ((match = aliasRegex.exec(sqlUpper)) !== null) {
        aliasMap[match[2]] = match[1];
    }

    const sqlKeywords = new Set([
        "SELECT", "FROM", "WHERE", "JOIN", "ON", "AND", "OR", "NOT",
        "IN", "INNER", "LEFT", "RIGHT", "OUTER", "FULL", "CROSS",
        "GROUP", "ORDER", "BY", "HAVING", "LIMIT", "OFFSET", "AS",
        "INTO", "VALUES", "SET", "DISTINCT", "TOP", "FETCH", "NEXT"
    ]);

    const tables = [...new Set(tablesRaw.filter(t => !sqlKeywords.has(t)))];

    
    const sqlClean = sql.replace(/'[^']*'/g, "''");
    const colRegex = /([a-zA-Z_]\w*)\.([a-zA-Z_]\w*)/g;
    const columnsByTable = {};
    
    while ((match = colRegex.exec(sqlClean)) !== null) {
        const tableOrAlias = match[1].toUpperCase();
        const col = match[2];
        const t = aliasMap[tableOrAlias] || tableOrAlias;
        
        if (!columnsByTable[t]) columnsByTable[t] = [];
        if (!sqlKeywords.has(col.toUpperCase()) && !columnsByTable[t].includes(col)) {
            columnsByTable[t].push(col);
        }
    }

    // Operations
    const operations = [];
    const firstWord = sqlUpper.trim().split(/\s+/)[0] || "";
    if (firstWord === "SELECT") operations.push("READ");
    else if (firstWord === "INSERT") operations.push("INSERT");
    else if (firstWord === "UPDATE") operations.push("UPDATE");
    else if (firstWord === "DELETE") operations.push("DELETE");
    else if (["CREATE", "ALTER", "DROP"].includes(firstWord)) operations.push("SCHEMA CHANGE");

    // Joins
    const joinTypesRegex = /(INNER|LEFT|RIGHT|FULL|CROSS)?\s*JOIN/g;
    const joinTypes = [];
    while ((match = joinTypesRegex.exec(sqlUpper)) !== null) {
        joinTypes.push(match[1] || "INNER");
    }
    
    const joinTablesRegex = /JOIN\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
    const joinInfo = [];
    let i = 0;
    while ((match = joinTablesRegex.exec(sqlUpper)) !== null) {
        const jType = joinTypes[i] ? joinTypes[i].trim() : "INNER";
        joinInfo.push({ type: jType || "INNER", table: match[1] });
        i++;
    }

    // WHERE
    let whereConditions = [];
    const whereMatch = sqlUpper.match(/\bWHERE\b(.+?)(?:\bGROUP\b|\bORDER\b|\bHAVING\b|\bLIMIT\b|$)/s);
    if (whereMatch && whereMatch[1]) {
        const conditionsRaw = whereMatch[1].trim();
        whereConditions = conditionsRaw.split(/\bAND\b|\bOR\b/).map(p => p.trim()).filter(Boolean);
    }

    return {
        tables,
        columns_by_table: columnsByTable,
        joins: joinInfo,
        operations,
        where_conditions: whereConditions.slice(0, 5),
        total_tables: tables.length,
        total_joins: joinInfo.length
    };
};

const classifyQuery = (sql) => {
    const sqlClean = sql.trim().toUpperCase();
    const firstWord = sqlClean.split(/\s+/)[0] || "";

    const ddl = ["CREATE", "ALTER", "DROP", "TRUNCATE", "RENAME", "COMMENT"];
    const dml = ["SELECT", "INSERT", "UPDATE", "DELETE", "MERGE", "CALL"];
    const dcl = ["GRANT", "REVOKE", "DENY"];
    const tcl = ["COMMIT", "ROLLBACK", "SAVEPOINT", "SET TRANSACTION", "BEGIN"];

    let category = "UNKNOWN", category_full = "Unknown", color = "gray", description = "Could not classify the query";

    if (ddl.includes(firstWord)) {
        [category, category_full, color, description] = ["DDL", "Data Definition Language", "blue", "Defines or modifies database structure/schema"];
    } else if (dml.includes(firstWord)) {
        [category, category_full, color, description] = ["DML", "Data Manipulation Language", "green", "Manipulates data within tables"];
    } else if (dcl.includes(firstWord)) {
        [category, category_full, color, description] = ["DCL", "Data Control Language", "orange", "Controls access permissions to database"];
    } else if (tcl.includes(firstWord)) {
        [category, category_full, color, description] = ["TCL", "Transaction Control Language", "purple", "Manages database transactions"];
    }

    return { category, category_full, sub_type: firstWord || "UNKNOWN", color, description };
};

const estimateTimeComplexity = (sql) => {
    const sqlUpper = sql.toUpperCase();
    let complexity = "O(n)";
    let complexityLabel = "Linear";
    let score = 1;
    let operations = [];

    const hasJoin = /\bJOIN\b/.test(sqlUpper);
    const hasNested = (sqlUpper.match(/\bSELECT\b/g) || []).length > 1;
    const hasGroupBy = /\bGROUP BY\b/.test(sqlUpper);
    const hasOrderBy = /\bORDER BY\b/.test(sqlUpper);
    const hasLike = /\bLIKE\b/.test(sqlUpper);
    const hasWhere = /\bWHERE\b/.test(sqlUpper);
    
    const joinCount = (sqlUpper.match(/\bJOIN\b/g) || []).length;
    const subqueryCount = (sqlUpper.match(/\bSELECT\b/g) || []).length - 1;

    if (hasWhere && !hasJoin && !hasNested) {
        complexity = "O(log n)";
        complexityLabel = "Logarithmic (indexed lookup)";
        score = 1;
        operations.push("WHERE filter");
    }

    if (hasJoin) {
        if (joinCount === 1) { [complexity, complexityLabel, score] = ["O(n × m)", "Quadratic (single join)", 3]; }
        else if (joinCount === 2) { [complexity, complexityLabel, score] = ["O(n × m × p)", "Cubic (two joins)", 4]; }
        else { [complexity, complexityLabel, score] = [`O(n^${joinCount + 1})`, `Polynomial (${joinCount} joins)`, 5]; }
        operations.push(`${joinCount} JOIN(s)`);
    }

    if (hasNested) {
        complexity = !hasJoin ? "O(n²)" : "O(n³)";
        complexityLabel = "Quadratic (nested subquery)";
        score = Math.max(score, 4);
        operations.push(`${subqueryCount} subquery(s)`);
    }

    if (hasGroupBy) {
        if (score < 3) complexity = "O(n log n)";
        if (score < 3) complexityLabel = "Linearithmic (GROUP BY)";
        score = Math.max(score, 3);
        operations.push("GROUP BY");
    }

    if (hasOrderBy) {
        if (score < 2) { [complexity, complexityLabel, score] = ["O(n log n)", "Linearithmic (ORDER BY sort)", 2]; }
        operations.push("ORDER BY sort");
    }

    if (hasLike) {
        score = Math.max(score, 3);
        operations.push("LIKE pattern match");
    }

    const ratings = { 1: "Excellent ⚡", 2: "Good ✅", 3: "Fair ⚠️", 4: "Poor 🔴", 5: "Critical ❌" };
    let tips = [];
    
    if (hasLike && sqlUpper.includes("LIKE '%")) tips.push("Avoid leading wildcard in LIKE — prevents index use");
    if (hasNested) tips.push("Rewrite subquery as JOIN for better performance");
    if (!hasWhere && /\bSELECT\b/.test(sqlUpper)) tips.push("Add WHERE clause to limit rows scanned");
    if (joinCount > 2) tips.push("Ensure all JOIN columns are indexed");
    if (tips.length === 0) tips.push("Query looks well-structured!");

    return {
        complexity,
        complexity_label: complexityLabel,
        score,
        performance: ratings[score] || "Unknown",
        operations: operations.length ? operations : ["Basic operation"],
        optimization_tips: tips
    };
};

const estimateRowsAffected = (sql) => {
    const sqlUpper = sql.toUpperCase().trim();
    const firstWord = sqlUpper.split(/\s+/)[0] || "";
    const defaultSize = 10000;
    
    const hasWhere = /\bWHERE\b/.test(sqlUpper);
    const limitMatch = sqlUpper.match(/\bLIMIT\s+(\d+)/);
    
    let est = 0, confidence = "Low", impact = "";
    
    if (firstWord === "SELECT") {
        if (limitMatch) { est = parseInt(limitMatch[1]); confidence = "High"; }
        else if (hasWhere) { est = Math.floor(defaultSize / 10); confidence = "Medium"; }
        else { est = defaultSize; confidence = "Low"; }
        impact = "READ — No data modification";
    } else if (firstWord === "INSERT") {
        const valuesPart = sqlUpper.includes("VALUES") ? sqlUpper.substring(sqlUpper.indexOf("VALUES")) : "";
        const valuesCount = (valuesPart.match(/\(/g) || []).length;
        est = Math.max(1, valuesCount);
        confidence = "High";
        impact = "WRITE — Rows will be added";
    } else if (firstWord === "UPDATE") {
        est = hasWhere ? Math.floor(defaultSize / 20) : defaultSize;
        confidence = hasWhere ? "Medium" : "Low";
        impact = hasWhere ? "WRITE — Rows will be modified" : "WRITE — ⚠️ All rows affected if no WHERE!";
    } else if (firstWord === "DELETE") {
        est = hasWhere ? Math.floor(defaultSize / 10) : defaultSize;
        confidence = hasWhere ? "Medium" : "Low";
        impact = hasWhere ? "WRITE — Rows will be deleted" : "WRITE — ⚠️ All rows deleted if no WHERE!";
    } else if (["CREATE", "ALTER", "DROP"].includes(firstWord)) {
        [est, confidence, impact] = [0, "High", "SCHEMA — No row-level impact"];
    } else if (firstWord === "TRUNCATE") {
        [est, confidence, impact] = [defaultSize, "Medium", "WRITE — ⚠️ ALL rows will be deleted!"];
    } else {
        impact = "Unknown operation";
    }

    let warning = null;
    if (["UPDATE", "DELETE"].includes(firstWord) && !hasWhere) {
        warning = "DANGER: No WHERE clause — this will affect ALL rows!";
    }
    if (firstWord === "TRUNCATE") warning = "TRUNCATE will delete ALL rows permanently!";

    return {
        estimated_rows: est,
        confidence,
        impact,
        warning,
        has_where: hasWhere
    };
};

module.exports = {
    extractTablesAndColumns,
    classifyQuery,
    estimateTimeComplexity,
    estimateRowsAffected
};

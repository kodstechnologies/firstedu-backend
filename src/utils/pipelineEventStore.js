const TTL_MS = Number(process.env.AI_PIPELINE_EVENT_TTL_MS || 30 * 60 * 1000);
const MAX_EVENTS_PER_KEY = Number(process.env.AI_PIPELINE_EVENT_MAX || 200);

/** @type {Map<string, { events: object[], createdAt: number, updatedAt: number }>} */
const sessions = new Map();

/** @type {Map<string, { entries: object[], nextIndex: number, createdAt: number, updatedAt: number }>} */
const partialQuestionSessions = new Map();

const pruneExpired = () => {
    const now = Date.now();
    for (const [key, session] of sessions.entries()) {
        if (now - session.updatedAt > TTL_MS) {
            sessions.delete(key);
        }
    }
    for (const [key, session] of partialQuestionSessions.entries()) {
        if (now - session.updatedAt > TTL_MS) {
            partialQuestionSessions.delete(key);
        }
    }
};

/**
 * @param {string} workflowLogKey
 * @param {string} event
 * @param {Record<string, unknown>} [details]
 */
export const appendPipelineEvent = (workflowLogKey, event, details = {}) => {
    const key = String(workflowLogKey || "").trim();
    if (!key) return;

    pruneExpired();
    const now = Date.now();
    const existing = sessions.get(key);
    const entry = {
        index: existing?.events.length ?? 0,
        ts: now,
        event: String(event || "").trim(),
        details: details && typeof details === "object" ? details : {},
    };

    if (existing) {
        existing.events.push(entry);
        if (existing.events.length > MAX_EVENTS_PER_KEY) {
            existing.events = existing.events.slice(-MAX_EVENTS_PER_KEY);
            existing.events.forEach((item, idx) => {
                item.index = idx;
            });
        }
        existing.updatedAt = now;
        return entry;
    }

    sessions.set(key, {
        events: [entry],
        createdAt: now,
        updatedAt: now,
    });
    return entry;
};

/**
 * @param {string} workflowLogKey
 * @param {number} [sinceIndex]
 */
/**
 * @param {string} workflowLogKey
 * @param {object[]} questions
 * @param {Record<string, unknown>} [meta]
 */
export const appendPartialQuestions = (workflowLogKey, questions = [], meta = {}) => {
    const key = String(workflowLogKey || "").trim();
    if (!key || !Array.isArray(questions) || !questions.length) return [];

    pruneExpired();
    const now = Date.now();
    let session = partialQuestionSessions.get(key);
    if (!session) {
        session = {
            entries: [],
            nextIndex: 0,
            createdAt: now,
            updatedAt: now,
        };
        partialQuestionSessions.set(key, session);
    }

    const added = [];
    for (const question of questions) {
        if (!question || typeof question !== "object") continue;
        const entry = {
            index: session.nextIndex++,
            ts: now,
            question,
            phase: String(meta.phase || "build"),
        };
        session.entries.push(entry);
        added.push(entry);
    }
    session.updatedAt = now;
    return added;
};

/**
 * @param {string} workflowLogKey
 * @param {number} [sinceIndex]
 */
export const getPartialQuestions = (workflowLogKey, sinceIndex = 0) => {
    pruneExpired();
    const key = String(workflowLogKey || "").trim();
    if (!key) return null;

    const session = partialQuestionSessions.get(key);
    if (!session) {
        return {
            workflowLogKey: key,
            partialQuestions: [],
            partialQuestionTotal: 0,
            sinceIndex: Math.max(0, sinceIndex),
        };
    }

    const from = Math.max(0, Number(sinceIndex) || 0);
    const partialQuestions = session.entries.filter((e) => e.index >= from);

    return {
        workflowLogKey: key,
        partialQuestions,
        partialQuestionTotal: session.entries.length,
        sinceIndex: from,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
    };
};

export const getPipelineEvents = (
    workflowLogKey,
    sinceIndex = 0,
    sincePartialIndex = 0
) => {
    pruneExpired();
    const key = String(workflowLogKey || "").trim();
    if (!key) return null;

    const session = sessions.get(key);
    const partial = getPartialQuestions(key, sincePartialIndex);
    if (!session) {
        return {
            workflowLogKey: key,
            events: [],
            total: 0,
            sinceIndex: Math.max(0, sinceIndex),
            partialQuestions: partial?.partialQuestions || [],
            partialQuestionTotal: partial?.partialQuestionTotal || 0,
            sincePartialIndex: Math.max(0, sincePartialIndex),
        };
    }

    const from = Math.max(0, Number(sinceIndex) || 0);
    const events = session.events.filter((e) => e.index >= from);

    return {
        workflowLogKey: key,
        events,
        total: session.events.length,
        sinceIndex: from,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        partialQuestions: partial?.partialQuestions || [],
        partialQuestionTotal: partial?.partialQuestionTotal || 0,
        sincePartialIndex: Math.max(0, sincePartialIndex),
    };
};

export default {
    appendPipelineEvent,
    appendPartialQuestions,
    getPartialQuestions,
    getPipelineEvents,
};

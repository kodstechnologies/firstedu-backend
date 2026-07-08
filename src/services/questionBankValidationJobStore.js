import fs from "fs";
import path from "path";

const JOB_TTL_MS = Number(
    process.env.AI_QB_BACKGROUND_VALIDATION_TTL_MS || 30 * 60 * 1000
);
const JOB_DIR = path.join(
    process.cwd(),
    "temp",
    "background-validation-jobs"
);

/** @type {Map<string, object>} */
const jobs = new Map();

const ensureJobDir = () => {
    if (!fs.existsSync(JOB_DIR)) {
        fs.mkdirSync(JOB_DIR, { recursive: true });
    }
};

const jobIdToFileName = (jobId) =>
    `${String(jobId || "unknown")
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .slice(0, 120)}.json`;

const jobFilePath = (jobId) => path.join(JOB_DIR, jobIdToFileName(jobId));

const readJobFromDisk = (jobId) => {
    try {
        const filePath = jobFilePath(jobId);
        if (!fs.existsSync(filePath)) return null;
        const raw = fs.readFileSync(filePath, "utf8");
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

const writeJobToDisk = (job) => {
    if (!job?.jobId) return;
    try {
        ensureJobDir();
        fs.writeFileSync(jobFilePath(job.jobId), JSON.stringify(job, null, 2), "utf8");
    } catch {
        // non-fatal — in-memory copy still works until restart
    }
};

const deleteJobFromDisk = (jobId) => {
    try {
        const filePath = jobFilePath(jobId);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
        // ignore
    }
};

const pruneExpiredJobs = () => {
    const now = Date.now();
    for (const [id, job] of jobs.entries()) {
        if (now - (job.updatedAt || job.createdAt) > JOB_TTL_MS) {
            jobs.delete(id);
            deleteJobFromDisk(id);
        }
    }

    try {
        ensureJobDir();
        for (const file of fs.readdirSync(JOB_DIR)) {
            if (!file.endsWith(".json")) continue;
            const filePath = path.join(JOB_DIR, file);
            const raw = fs.readFileSync(filePath, "utf8");
            const job = JSON.parse(raw);
            if (now - (job.updatedAt || job.createdAt) > JOB_TTL_MS) {
                fs.unlinkSync(filePath);
            }
        }
    } catch {
        // ignore prune errors on disk
    }
};

export const createValidationJob = (jobId, payload = {}) => {
    pruneExpiredJobs();
    const now = Date.now();
    const job = {
        jobId,
        status: "pending",
        phase: "queued",
        createdAt: now,
        updatedAt: now,
        ...payload,
    };
    jobs.set(jobId, job);
    writeJobToDisk(job);
    return job;
};

export const updateValidationJob = (jobId, patch = {}) => {
    const existing = jobs.get(jobId) || readJobFromDisk(jobId);
    if (!existing) return null;
    const updated = {
        ...existing,
        ...patch,
        jobId,
        updatedAt: Date.now(),
    };
    jobs.set(jobId, updated);
    writeJobToDisk(updated);
    return updated;
};

export const getValidationJob = (jobId) => {
    pruneExpiredJobs();
    const cached = jobs.get(jobId);
    if (cached) return cached;
    const fromDisk = readJobFromDisk(jobId);
    if (fromDisk) {
        jobs.set(jobId, fromDisk);
        return fromDisk;
    }
    return null;
};

export default {
    createValidationJob,
    updateValidationJob,
    getValidationJob,
};

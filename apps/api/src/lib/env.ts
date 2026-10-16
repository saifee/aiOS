/**
 * Normalise environment variables that hosting panels often capitalise or pad ("TRUE", "PRODUCTION", " true ").
 * MUST be the first import of the server so every package sees the cleaned values.
 */
const LOWER = ["NODE_ENV", "AUTO_MIGRATE", "LITE_MODE", "TRUST_PROXY", "INLINE_SCHEDULER", "STARTUP_DEBUG", "SETUP_DEBUG", "ALLOW_UNSIGNED_WEBHOOKS", "ALLOW_PRIVATE_AI_URLS", "CLAUDE_MODEL", "OPENAI_MODEL", "GEMINI_MODEL"];
for (const k of LOWER) { const v = process.env[k]; if (typeof v === "string") process.env[k] = v.trim().toLowerCase(); }
// Secrets and URLs are only trimmed (case matters), never lower-cased.
for (const k of ["JWT_SECRET", "ENCRYPTION_KEY", "CRON_SECRET", "SETUP_TOKEN", "DATABASE_URL", "APP_URL", "WEBHOOK_SHARED_SECRET"]) { const v = process.env[k]; if (typeof v === "string") process.env[k] = v.trim().replace(/^["']|["']$/g, ""); }
export {};

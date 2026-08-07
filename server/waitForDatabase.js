import { testConnection, getDbDriver } from './db.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeDatabaseTarget() {
  const url = String(process.env.DATABASE_URL || '').trim();
  if (url.startsWith('postgres')) {
    try {
      const parsed = new URL(url);
      return `${parsed.hostname}:${parsed.port || '5432'}/${parsed.pathname.replace(/^\//, '') || 'postgres'}`;
    } catch {
      return 'postgres (DATABASE_URL set)';
    }
  }

  const host = process.env.DB_HOST || '127.0.0.1';
  const port = process.env.DB_PORT || '3306';
  const name = process.env.DB_NAME || 'node_template';
  return `${host}:${port}/${name}`;
}

export async function waitForDatabase({
  maxAttempts = 30,
  delayMs = 2000,
} = {}) {
  const target = describeDatabaseTarget();
  const driver = getDbDriver();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await testConnection();
      if (attempt > 1) {
        console.log(`[db] Connected to ${driver} at ${target} (attempt ${attempt})`);
      }
      return;
    } catch (error) {
      const retryable = ['EAI_AGAIN', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(error?.code);
      const isLast = attempt === maxAttempts;

      console.error(
        `[db] Connection attempt ${attempt}/${maxAttempts} failed (${target}): ${error.message}`,
      );

      if (!retryable && !isLast) {
        throw error;
      }

      if (isLast) {
        const hint = driver === 'postgres'
          ? 'On Coolify: open your PostgreSQL resource → connect/link it to this app (same server/network), then copy the current INTERNAL connection URL into DATABASE_URL. Stale hostnames cause getaddrinfo EAI_AGAIN.'
          : 'Check DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, and DB_NAME.';
        throw new Error(`${error.message}. ${hint}`);
      }

      await sleep(delayMs);
    }
  }
}

import './env';
import type { D1Database } from '@cloudflare/d1';

export function isDbConfigured(db: D1Database | null | undefined): boolean {
  return Boolean(db);
}

export async function query<T extends Record<string, unknown>>(
  db: D1Database,
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const stmt = params.length > 0 ? db.prepare(text).bind(...(params as never[])) : db.prepare(text);
  const res = await stmt.all<T>();
  return (res.results ?? []) as T[];
}

export async function checkDb(db: D1Database): Promise<'ok' | 'error'> {
  try {
    await db.prepare('SELECT 1').first();
    return 'ok';
  } catch (error) {
    console.error('[db] health check failed:', error);
    return 'error';
  }
}

export class DbUnavailableError extends Error {
  constructor() {
    super('DB_NOT_CONFIGURED');
    this.name = 'DbUnavailableError';
  }
}
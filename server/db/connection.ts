/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import pg from 'pg';

const { Pool } = pg;

let poolInstance: pg.Pool | null = null;

/**
 * Returns the active PostgreSQL connection pool instance, initializing lazily.
 * If DATABASE_URL is not configured, returns null without attempting to connect.
 */
export function getPool(): pg.Pool | null {
  if (poolInstance) {
    return poolInstance;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return null;
  }
  poolInstance = new Pool({
    connectionString,
    max: 20, // maximum connection pool size
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  return poolInstance;
}

/**
 * Returns the active pool or throws an error if DATABASE_URL is not configured.
 */
export function getRequiredPool(): pg.Pool {
  const p = getPool();
  if (!p) {
    throw new Error('DATABASE_URL is not configured. Database connection is required.');
  }
  return p;
}

/**
 * Injects a pool instance for testing purposes.
 */
export function setPoolForTesting(testPool: any): void {
  poolInstance = testPool;
}

/**
 * Compatibility proxy for code referencing pool directly.
 * Throws a descriptive error only if accessed when DATABASE_URL is missing.
 */
export const pool = new Proxy({} as pg.Pool, {
  get(_target, prop) {
    const activePool = getPool();
    if (!activePool) {
      throw new Error(
        'DATABASE_URL is not configured. Local PostgreSQL connection is only available when DATABASE_URL is set in your local environment.'
      );
    }
    const val = (activePool as any)[prop];
    return typeof val === 'function' ? val.bind(activePool) : val;
  },
});

/**
 * Executes a parameterized SQL query on the pool.
 * If DATABASE_URL is not configured, aborts gracefully without attempting connection.
 */
export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  const activePool = getPool();
  if (!activePool) {
    throw new Error(
      'Database query aborted: DATABASE_URL is not configured. Set DATABASE_URL in your local development environment to execute database queries.'
    );
  }
  const start = Date.now();
  const res = await activePool.query<T>(text, params);
  const duration = Date.now() - start;
  if (process.env.DEBUG_SQL === 'true') {
    console.log(`[SQL Query] duration: ${duration}ms, rows: ${res.rowCount}`);
  }
  return res;
}

/**
 * Checks connection health to PostgreSQL database.
 * Returns false immediately if DATABASE_URL is not set, without attempting any network connection.
 */
export async function checkConnection(): Promise<boolean> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return false;
  }
  const activePool = getPool();
  if (!activePool) {
    return false;
  }
  try {
    const res = await activePool.query('SELECT 1 AS alive;');
    return res.rows.length > 0;
  } catch (error) {
    console.error('[DB Connection Check Failed]:', error);
    return false;
  }
}

/**
 * Closes all pool connections gracefully if the pool was initialized.
 */
export async function closePool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}


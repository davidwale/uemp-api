import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { sequelize } from './sequelize.js';

/** Creates the configured database if it doesn't exist (connects via the `postgres` maintenance DB). */
export async function createDatabase(): Promise<void> {
  const url = new URL(env.databaseUrl);
  const dbName = decodeURIComponent(url.pathname.slice(1));
  url.pathname = '/postgres';
  const client = new pg.Client({
    connectionString: url.toString(),
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (rowCount) {
      logger.info(`Database "${dbName}" already exists`);
    } else {
      await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
      logger.info(`Database "${dbName}" created`);
    }
  } catch (err) {
    // Managed providers often pre-create the database and deny CREATE DATABASE; that's fine.
    logger.warn({ err }, 'Could not create database (it may already be provisioned)');
  } finally {
    await client.end();
  }
}

export async function dropSchema(): Promise<void> {
  await sequelize.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
}

import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { QueryInterface } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';
import { logger } from '../lib/logger.js';
import { sequelize } from './sequelize.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Migrations are plain TypeScript modules exporting `up` and `down`.
 * Umzug records applied migrations in the `schema_migrations` table.
 * Works under both `tsx` (src/*.ts) and compiled output (dist/*.js).
 */
export const migrator = new Umzug<QueryInterface>({
  migrations: {
    glob: ['migrations/*.{ts,js}', { cwd: here, ignore: ['**/*.d.ts'] }],
    resolve: ({ name, path, context }) => {
      const load = () => import(pathToFileURL(path!).href) as Promise<MigrationModule>;
      return {
        name: name.replace(/\.(ts|js)$/, ''),
        up: async () => (await load()).up({ context }),
        down: async () => (await load()).down({ context }),
      };
    },
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize, tableName: 'schema_migrations' }),
  logger: {
    info: (msg) => logger.info(msg),
    warn: (msg) => logger.warn(msg),
    error: (msg) => logger.error(msg),
    debug: (msg) => logger.debug(msg),
  },
});

export interface MigrationModule {
  up: (params: { context: QueryInterface }) => Promise<void>;
  down: (params: { context: QueryInterface }) => Promise<void>;
}

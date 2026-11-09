/**
 * Database management CLI.
 *
 *   npm run db:create     create the database if it does not exist
 *   npm run db:migrate    apply pending migrations
 *   npm run db:rollback   revert the last migration
 *   npm run db:seed       load demo data (skipped if data exists; pass --fresh to wipe first)
 *   npm run db:reset      drop everything, migrate, and seed fresh
 */
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { sequelize } from '../models/index.js';
import { createDatabase, dropSchema } from './admin.js';
import { seedDemoData } from './seeders/demo.js';
import { migrator } from './umzug.js';

async function run(command: string | undefined, args: string[]) {
  switch (command) {
    case 'create':
      return createDatabase();
    case 'migrate':
      return void (await migrator.up());
    case 'rollback':
      return void (await migrator.down());
    case 'seed':
      return seedDemoData({ fresh: args.includes('--fresh') });
    case 'reset':
      if (env.isProduction && !args.includes('--force')) {
        throw new Error('Refusing to reset a production database without --force');
      }
      await dropSchema();
      await migrator.up();
      return seedDemoData({ fresh: true });
    default:
      throw new Error(`Unknown command "${command}". Use create | migrate | rollback | seed | reset`);
  }
}

run(process.argv[2], process.argv.slice(3))
  .then(async () => {
    await sequelize.close();
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error({ err }, 'Database command failed');
    await sequelize.close().catch(() => undefined);
    process.exit(1);
  });

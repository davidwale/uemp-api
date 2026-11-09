import { Sequelize } from 'sequelize';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

export const sequelize = new Sequelize(env.databaseUrl, {
  dialect: 'postgres',
  logging: env.LOG_LEVEL === 'debug' || env.LOG_LEVEL === 'trace' ? (sql) => logger.debug(sql) : false,
  dialectOptions: env.DATABASE_SSL ? { ssl: { require: true, rejectUnauthorized: false } } : {},
  pool: { max: 10, min: 0, idle: 10_000, acquire: 30_000 },
  define: {
    underscored: true,
    timestamps: true,
  },
});

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { originCheck } from './middleware/originCheck.js';
import { apiRateLimiter } from './middleware/rateLimit.js';
import { sequelize } from './models/index.js';
import { apiRouter } from './routes.js';

export function createApp(): Express {
  const app = express();

  // Behind a reverse proxy so req.ip and secure cookies work correctly.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (!env.isTest) app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));

  app.get('/api/health', async (_req, res) => {
    await sequelize.authenticate();
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.use('/api/v1', apiRateLimiter, originCheck, apiRouter);
  app.use(notFoundHandler);

  app.use(errorHandler);
  return app;
}

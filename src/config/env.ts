import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment is parsed once at boot. An invalid configuration fails fast
 * with a readable message rather than surfacing as an obscure runtime error.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  TEST_DATABASE_URL: z.string().optional(),
  DATABASE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
  SESSION_IDLE_TIMEOUT_MINUTES: z.coerce.number().positive().default(120),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  /** The test suite always runs against an isolated database. */
  databaseUrl:
    raw.NODE_ENV === 'test' ? (raw.TEST_DATABASE_URL ?? `${raw.DATABASE_URL}_test`) : raw.DATABASE_URL,
} as const;

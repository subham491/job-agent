import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  /** 32 random bytes, base64. Generate with: openssl rand -base64 32 */
  VAULT_KEY: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, {
    message: 'VAULT_KEY must be 32 bytes, base64 encoded',
  }),
  /** Naukri login. Without it the connector can still search but cannot log in. */
  NAUKRI_USERNAME: z.string().optional(),
  NAUKRI_PASSWORD: z.string().optional(),
  /**
   * When to try the daily Naukri profile refresh, as a cron line in India time. Leave unset to switch it off.
   * It runs at most once a day, so an hourly line ("0 9-21 * * *") just means "catch up if the PC was off at 9".
   */
  NAUKRI_REFRESH_CRON: z.string().optional(),
  /** Anthropic API key. Without it the AI features are off and the daily routine uses its rule-based order. */
  ANTHROPIC_API_KEY: z.string().optional(),
  /** Which Claude model answers. Defaults to claude-opus-5-5. */
  AI_MODEL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return parsed.data;
}

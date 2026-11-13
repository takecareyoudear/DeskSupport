import { readFileSync } from 'node:fs';

export function databaseOptions(env = process.env) {
  return {
    connectionString: env.DATABASE_URL,
    ssl: env.DATABASE_SSL === 'true' ? {
      rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
      ...(env.DATABASE_CA_FILE ? { ca: readFileSync(env.DATABASE_CA_FILE, 'utf8') } : {})
    } : false
  };
}

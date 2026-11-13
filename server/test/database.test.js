import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseOptions } from '../src/database.js';

test('hosted database verifies certificates unless explicitly disabled', () => {
  const env = { DATABASE_URL: 'postgresql://example/test', DATABASE_SSL: 'true' };
  assert.equal(databaseOptions(env).ssl.rejectUnauthorized, true);
  assert.equal(databaseOptions({...env, DATABASE_SSL_REJECT_UNAUTHORIZED: 'false'}).ssl.rejectUnauthorized, false);
  assert.equal(databaseOptions({...env, DATABASE_SSL_REJECT_UNAUTHORIZED: 'true'}).ssl.rejectUnauthorized, true);
});

test('local database can explicitly disable TLS', () => {
  assert.equal(databaseOptions({ DATABASE_SSL: 'false' }).ssl, false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerPasswordRecovery } from '../src/password-recovery.js';
import { checkPassword, otpHash } from '../src/security.js';

test('password recovery validates, limits guesses, consumes codes, and revokes sessions', async t => {
  const secret = 'test-secret-for-password-recovery';
  const email = 'person@example.com';
  let row;
  let passwordHash;
  let sessionsDeleted = false;
  let delivered;
  let mailCount = 0;
  const queries = [];
  const pool = {
    async query(sql, params = []) {
      queries.push(sql);
      if (sql.startsWith('INSERT INTO password_resets')) {
        if (params[0] !== email || row) return { rowCount: 0 };
        row = { code_hash: params[1], attempts: 0, unexpired: true };
        return { rowCount: 1 };
      }
      if (sql.startsWith('SELECT *')) return { rows: row ? [{ ...row }] : [] };
      if (sql.startsWith('UPDATE password_resets')) row.attempts++;
      if (sql.startsWith('UPDATE users')) passwordHash = params[1];
      if (sql.startsWith('DELETE FROM sessions')) sessionsDeleted = true;
      if (sql.startsWith('DELETE FROM password_resets')) row = undefined;
      return { rowCount: 1 };
    },
    async connect() { return { query: this.query.bind(this), release() {} }; },
  };
  const app = express();
  app.use(express.json());
  registerPasswordRecovery(app, { pool, mail: { async sendMail(message) { delivered = message; mailCount++; } }, sendLimiter: (_req, _res, next) => next(), cookieOptions: { path: '/api/auth' }, secret, from: 'support@example.com' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  async function post(path, body) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  assert.equal((await post('forgot-password', { email: 'invalid' })).status, 400);
  const unknown = await post('forgot-password', { email: 'unknown@example.com' });
  assert.equal(mailCount, 0);
  const known = await post('forgot-password', { email: ' PERSON@EXAMPLE.COM ' });
  assert.deepEqual(known.body, unknown.body);
  assert.equal(mailCount, 1);
  const code = delivered.text.match(/\b\d{6}\b/)[0];
  assert.notEqual(row.code_hash, otpHash(email, code, secret));
  await post('forgot-password', { email });
  assert.equal(mailCount, 1, 'cooldown does not send another email');
  const payload = { email, otp: code, password: 'a fresh strong password' };
  assert.equal((await post('reset-password', { ...payload, password: 'short' })).status, 400);
  assert.equal(row.attempts, 0);
  row.unexpired = false;
  assert.equal((await post('reset-password', payload)).status, 400);
  row.unexpired = true;
  const wrong = code === '111111' ? '222222' : '111111';
  for (let i = 0; i < 5; i++) assert.equal((await post('reset-password', { ...payload, otp: wrong })).status, 400);
  assert.equal(row.attempts, 5);
  assert.equal((await post('reset-password', payload)).status, 400);
  assert.equal(passwordHash, undefined);
  row.attempts = 0; // A new emailed code resets the attempt budget.
  const reset = await post('reset-password', payload);
  assert.equal(reset.status, 200);
  assert.ok(await checkPassword(payload.password, passwordHash));
  assert.equal(sessionsDeleted, true);
  assert.match(reset.headers.get('set-cookie'), /session=;/);
  assert.equal(row, undefined);
  assert.equal((await post('reset-password', payload)).status, 400, 'code cannot be reused');
  assert.ok(queries.includes('COMMIT'));
});

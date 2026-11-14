import { randomInt } from 'node:crypto';
import { hashPassword, otpHash } from './security.js';

export function registerPasswordRecovery(app, { pool, mail, sendLimiter, cookieOptions, secret, from }) {
  const normalize = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
  const validEmail = email => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  // Domain separation prevents a registration code from being used for a reset.
  const digest = (email, code) => otpHash(`password-reset:${email}`, code, secret);
  const sent = { message: 'If an account exists for this email, a reset code has been sent. Check your inbox and spam folder. You can request another code after 60 seconds.' };
  app.post('/api/auth/forgot-password', sendLimiter, async (req, res) => {
    const email = normalize(req.body.email);
    if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    const code = String(randomInt(100000, 1000000));
    const hash = digest(email, code);
    const result = await pool.query(`INSERT INTO password_resets(email,code_hash,expires_at)
      SELECT email,$2,now()+interval '10 minutes' FROM users WHERE email=$1
      ON CONFLICT(email) DO UPDATE SET code_hash=$2,expires_at=now()+interval '10 minutes',sent_at=now(),attempts=0
      WHERE password_resets.sent_at < now()-interval '60 seconds' RETURNING email`, [email, hash]);
    if (result.rowCount) {
      try {
        await mail.sendMail({ from, to: email, subject: 'Reset your SupportDesk password', text: `Your password reset code is ${code}. It expires in 10 minutes and can only be used once. If you did not request a password reset, ignore this email. Your password has not changed.` });
      } catch {
        await pool.query('DELETE FROM password_resets WHERE email=$1 AND code_hash=$2', [email, hash]);
        // Keep the response identical for registered and unknown addresses.
        console.error('Password recovery email delivery failed');
      }
    }
    res.json(sent);
  });
  app.post('/api/auth/reset-password', async (req, res) => {
    const email = normalize(req.body.email);
    const { otp, password } = req.body;
    if (!validEmail(email) || typeof otp !== 'string' || !/^\d{6}$/.test(otp)) return res.status(400).json({ error: 'Enter a valid email and 6-digit code.' });
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) return res.status(400).json({ error: 'Choose a password of 12–128 characters.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT *, expires_at > now() AS unexpired FROM password_resets WHERE email=$1 FOR UPDATE', [email]);
      const row = rows[0];
      if (!row || !row.unexpired || row.attempts >= 5) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Code expired or unavailable. Request a new code.' });
      }
      if (row.code_hash !== digest(email, otp)) {
        await client.query('UPDATE password_resets SET attempts=attempts+1 WHERE email=$1', [email]);
        await client.query('COMMIT');
        return res.status(400).json({ error: 'Incorrect code. Please try again.' });
      }
      const hash = await hashPassword(password);
      await client.query('UPDATE users SET password_hash=$2 WHERE email=$1', [email, hash]);
      await client.query('DELETE FROM sessions WHERE user_id=(SELECT id FROM users WHERE email=$1)', [email]);
      await client.query('DELETE FROM password_resets WHERE email=$1', [email]);
      await client.query('COMMIT');
      res.clearCookie('session', cookieOptions);
      res.json({ message: 'Password updated. Sign in with your new password.' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  });
}

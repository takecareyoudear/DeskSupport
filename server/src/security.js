import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHmac, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return `${salt}:${derived.toString('hex')}`;
}
export async function checkPassword(password, hash) {
  const [salt, value] = hash.split(':');
  const derived = await scrypt(password, salt, 64);
  const expected = Buffer.from(value, 'hex');
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
export const otpHash = (email, code, secret) => createHmac('sha256', secret).update(`${email}:${code}`).digest('hex');
export const sessionHash = value => createHash('sha256').update(value).digest('hex');

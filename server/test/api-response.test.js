import test from 'node:test';
import assert from 'node:assert/strict';
import { readApiResponse } from '../../client/src/api.mjs';

test('auth response handles empty proxy failures and non-JSON responses', async () => {
  await assert.rejects(readApiResponse(new Response('', {status:500})), /temporarily unavailable/);
  await assert.rejects(readApiResponse(new Response('<html>Bad gateway</html>', {status:502})), /temporarily unavailable/);
  await assert.rejects(readApiResponse(new Response('', {status:200})), /incomplete response/);
  await assert.rejects(readApiResponse(new Response('{"message":', {status:200})), /incomplete response/);
  await assert.rejects(readApiResponse(new Response('null', {status:200})), /incomplete response/);
  await assert.rejects(readApiResponse(new Response('Too many requests', {status:429})), /Too many requests/);
  await assert.rejects(readApiResponse(new Response('{"error":"Incorrect code."}', {status:400})), /Incorrect code/);
  assert.deepEqual(await readApiResponse(new Response('{"message":"Code sent."}')), {message:'Code sent.'});
});

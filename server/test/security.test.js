import test from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword,checkPassword,otpHash} from '../src/security.js';
test('password hashing uses unique salts and rejects incorrect passwords',async()=>{const a=await hashPassword('correct horse battery');const b=await hashPassword('correct horse battery');assert.notEqual(a,b);assert.equal(await checkPassword('correct horse battery',a),true);assert.equal(await checkPassword('wrong password',a),false);});
test('OTP hashes bind both email and code to a secret',()=>{assert.notEqual(otpHash('a@example.com','123456','secret'),otpHash('b@example.com','123456','secret'));assert.notEqual(otpHash('a@example.com','123456','secret'),otpHash('a@example.com','123457','secret'));});

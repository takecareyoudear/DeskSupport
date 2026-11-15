import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import pg from 'pg';
import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'node:fs';
import { randomInt, randomUUID } from 'node:crypto';
import { otpHash } from './security.js';
import { databaseOptions } from './database.js';
import { registerPasswordRecovery } from './password-recovery.js';
import { registerPayables } from './payables.js';
import { registerAssets } from './assets.js';
import { registerWorkspace } from './workspace.js';
import {registerRoles} from './roles.js';
import { registerAccounts } from './accounts.js';

for (const key of ['DATABASE_URL','CLIENT_ORIGIN','TOKEN_SECRET','OTP_SECRET','SMTP_HOST','SMTP_USER','SMTP_PASSWORD','MAIL_FROM']) {
  if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);
}
for (const key of ['TOKEN_SECRET','OTP_SECRET']) if (process.env[key].length < 32) throw new Error(`${key} must contain at least 32 characters`);
const production = process.env.NODE_ENV === 'production';
const pool = new pg.Pool({...databaseOptions(), max:3, connectionTimeoutMillis:15000, idleTimeoutMillis:10000});
pool.on('error',()=>console.error('Database connection error'));
await pool.query(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
await pool.query(readFileSync(new URL('./organizations.sql',import.meta.url),'utf8'));
await pool.query(readFileSync(new URL('./assets.sql',import.meta.url),'utf8'));
await pool.query(readFileSync(new URL('./payables.sql',import.meta.url),'utf8'));
await pool.query(readFileSync(new URL('./roles.sql',import.meta.url),'utf8'));
const mail = nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000,disableFileAccess:true,disableUrlAccess:true});
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS||0));
app.use(helmet());
app.use(cors({origin:process.env.CLIENT_ORIGIN,credentials:true}));
app.use(express.json({limit:'8kb'}));
app.use((req,res,next)=>{req.body ||= {};next();});
app.use('/api/auth',(req,res,next)=>{
  if (req.method !== 'GET' && req.get('origin') !== process.env.CLIENT_ORIGIN) return res.status(403).json({error:'Request origin is not allowed.'});
  next();
});
app.use('/api/auth',rateLimit({windowMs:15*60*1000,limit:50,skip:req=>req.path.startsWith('/workspace/'),standardHeaders:'draft-8',legacyHeaders:false,handler:(_req,res)=>res.status(429).json({error:'Too many requests. Please try again in 15 minutes.'})}));
const sendLimiter = rateLimit({windowMs:60*60*1000,limit:10,handler:(_req,res)=>res.status(429).json({error:'Too many email requests. Please try again later.'})});
const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validEmail = value => value.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const cookieOptions = {httpOnly:true,secure:production,sameSite:production?'none':'lax',path:'/api/auth'};
registerPasswordRecovery(app, { pool, mail, sendLimiter, cookieOptions, secret: process.env.OTP_SECRET, from: process.env.MAIL_FROM });
function sessionCookie(req) { return (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('session='))?.slice(8)||''; }
app.get('/api/health',(_req,res)=>res.json({status:'ok'}));
app.post('/api/auth/send-otp',sendLimiter,async(req,res)=>{
  const email = normalizeEmail(req.body.email);
  if (!validEmail(email)) return res.status(400).json({error:'Enter a valid email address.'});
  const code = String(randomInt(100000,1000000));
  const hash = otpHash(email,code,process.env.OTP_SECRET);
  const result = await pool.query(`INSERT INTO email_verifications(email,code_hash,expires_at) VALUES($1,$2,now()+interval '10 minutes') ON CONFLICT(email) DO UPDATE SET code_hash=$2,expires_at=now()+interval '10 minutes',sent_at=now(),attempts=0,verified_at=NULL,registration_id=NULL WHERE email_verifications.sent_at < now()-interval '60 seconds' RETURNING email`,[email,hash]);
  if (!result.rowCount) return res.status(429).json({error:'Please wait 60 seconds before requesting another code.'});
  try { await mail.sendMail({from:process.env.MAIL_FROM,to:email,subject:'Your SupportDesk verification code',text:`Your verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`}); }
  catch { await pool.query('DELETE FROM email_verifications WHERE email=$1 AND code_hash=$2',[email,hash]); return res.status(502).json({error:'We could not send your email. Please try again shortly.'}); }
  res.json({message:'Verification code sent.'});
});
app.post('/api/auth/verify-otp',async(req,res)=>{
  const email=normalizeEmail(req.body.email), code=req.body.otp;
  if (!validEmail(email)||typeof code!=='string'||!/^\d{6}$/.test(code)) return res.status(400).json({error:'Enter a valid email and 6-digit code.'});
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const {rows}=await client.query('SELECT * FROM email_verifications WHERE email=$1 FOR UPDATE',[email]);
    const row=rows[0];
    if (!row||row.verified_at||row.attempts>=5||new Date(row.expires_at)<=new Date()) { await client.query('ROLLBACK');return res.status(400).json({error:'Code expired or unavailable. Request a new code.'}); }
    if (row.code_hash!==otpHash(email,code,process.env.OTP_SECRET)) {await client.query('UPDATE email_verifications SET attempts=attempts+1 WHERE email=$1',[email]);await client.query('COMMIT');return res.status(400).json({error:'Incorrect code. Please try again.'});}
    const id=randomUUID();
    await client.query('UPDATE email_verifications SET verified_at=now(),registration_id=$2 WHERE email=$1',[email,id]);
    await client.query('COMMIT');
    res.json({registrationToken:jwt.sign({email,purpose:'register'},process.env.TOKEN_SECRET,{expiresIn:'15m',jwtid:id,issuer:'supportdesk',audience:'registration',algorithm:'HS256'})});
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
});
await registerAccounts(app,{pool,cookieOptions,sessionCookie,tokenSecret:process.env.TOKEN_SECRET});
registerWorkspace(app,{pool,sessionCookie,origin:process.env.CLIENT_ORIGIN});
registerRoles(app,{pool});
registerAssets(app,{pool});
registerPayables(app,{pool});
app.use((err,req,res,next)=>{if(err.type==='entity.parse.failed')return res.status(400).json({error:'Invalid request.'});console.error('Request failed:',err.code||err.name);res.status(500).json({error:'Something went wrong. Please try again later.'});});
export default app;

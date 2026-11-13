import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import pg from 'pg';
import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'node:fs';
import { randomInt, randomUUID, randomBytes } from 'node:crypto';
import { hashPassword, checkPassword, otpHash, sessionHash } from './security.js';
import { databaseOptions } from './database.js';

for (const key of ['DATABASE_URL','CLIENT_ORIGIN','TOKEN_SECRET','OTP_SECRET','SMTP_HOST','SMTP_USER','SMTP_PASSWORD','MAIL_FROM']) {
  if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);
}
for (const key of ['TOKEN_SECRET','OTP_SECRET']) if (process.env[key].length < 32) throw new Error(`${key} must contain at least 32 characters`);
const production = process.env.NODE_ENV === 'production';
const pool = new pg.Pool({...databaseOptions(), max:3, connectionTimeoutMillis:15000, idleTimeoutMillis:10000});
pool.on('error',()=>console.error('Database connection error'));
await pool.query(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
const mail = nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD},disableFileAccess:true,disableUrlAccess:true});
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
app.use('/api/auth',rateLimit({windowMs:15*60*1000,limit:50,standardHeaders:'draft-8',legacyHeaders:false,handler:(_req,res)=>res.status(429).json({error:'Too many requests. Please try again in 15 minutes.'})}));
const sendLimiter = rateLimit({windowMs:60*60*1000,limit:10,handler:(_req,res)=>res.status(429).json({error:'Too many email requests. Please try again later.'})});
const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validEmail = value => value.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const cookieOptions = {httpOnly:true,secure:production,sameSite:production?'none':'lax',path:'/api/auth'};
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
app.post('/api/auth/register',async(req,res)=>{
  const {registrationToken,password}=req.body;
  const fullName=typeof req.body.fullName==='string'?req.body.fullName.trim():'';
  if(fullName.length<2||fullName.length>100||typeof password!=='string'||password.length<12||password.length>128) return res.status(400).json({error:'Enter your full name and a password of 12–128 characters.'});
  let claims;
  try {claims=jwt.verify(registrationToken,process.env.TOKEN_SECRET,{algorithms:['HS256'],issuer:'supportdesk',audience:'registration'});if(claims.purpose!=='register') throw new Error();} catch{return res.status(401).json({error:'Verification expired. Please verify your email again.'});}
  const hash=await hashPassword(password);
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const consumed=await client.query(`DELETE FROM email_verifications WHERE email=$1 AND registration_id=$2 AND verified_at > now()-interval '15 minutes' RETURNING email`,[claims.email,claims.jti]);
    if(!consumed.rowCount){await client.query('ROLLBACK');return res.status(401).json({error:'Please verify your email again.'});}
    await client.query('INSERT INTO users(id,email,full_name,password_hash) VALUES($1,$2,$3,$4)',[randomUUID(),claims.email,fullName,hash]);
    await client.query('COMMIT');res.status(201).json({message:'Account created.'});
  }catch(error){await client.query('ROLLBACK');if(error.code==='23505')return res.status(409).json({error:'An account already exists. Please log in.'});throw error;}finally{client.release();}
});
const dummyHash=await hashPassword(randomBytes(32).toString('hex'));
app.post('/api/auth/login',async(req,res)=>{
  const email=normalizeEmail(req.body.email), password=req.body.password;
  if(!validEmail(email)||typeof password!=='string'||password.length>128)return res.status(400).json({error:'Enter a valid email and password.'});
  const {rows}=await pool.query('SELECT * FROM users WHERE email=$1',[email]);
  const user=rows[0];
  const valid=await checkPassword(password,user?.password_hash||dummyHash);
  if(!user||!valid)return res.status(401).json({error:'Email or password is incorrect.'});
  const token=randomBytes(32).toString('hex');
  await pool.query(`INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')`,[sessionHash(token),user.id]);
  res.cookie('session',token,{...cookieOptions,maxAge:86400000});
  res.json({user:{id:user.id,email:user.email,fullName:user.full_name}});
});
app.get('/api/auth/me',async(req,res)=>{
  const {rows}=await pool.query('SELECT u.id,u.email,u.full_name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',[sessionHash(sessionCookie(req))]);
  if(!rows[0])return res.status(401).json({error:'Please log in.'});
  res.json({user:{id:rows[0].id,email:rows[0].email,fullName:rows[0].full_name}});
});
app.post('/api/auth/logout',async(req,res)=>{await pool.query('DELETE FROM sessions WHERE token_hash=$1',[sessionHash(sessionCookie(req))]);res.clearCookie('session',cookieOptions);res.json({message:'Signed out.'});});
app.use((err,req,res,next)=>{if(err.type==='entity.parse.failed')return res.status(400).json({error:'Invalid request.'});console.error('Request failed:',err.code||err.name);res.status(500).json({error:'Something went wrong. Please try again later.'});});
export default app;

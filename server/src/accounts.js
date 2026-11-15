import {menuAccess} from './roles.js';
import { randomUUID, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { hashPassword, checkPassword, sessionHash } from './security.js';
import { publicUser, validUsername } from './workspace.js';
const normalizeEmail=value=>typeof value==='string'?value.trim().toLowerCase():'';
const validEmail=value=>value.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export async function registerAccounts(app,{pool,cookieOptions,sessionCookie,tokenSecret}) {
app.post('/api/auth/register',async(req,res)=>{
  const {registrationToken,password}=req.body;
  const username=typeof req.body.username==='string'?req.body.username.trim().toLowerCase():'';
  if(!validUsername(username)) return res.status(400).json({error:'Choose a username of 3-40 letters, numbers, underscores or dots.'});
  const fullName=typeof req.body.fullName==='string'?req.body.fullName.trim():'';
  if(fullName.length<2||fullName.length>100||typeof password!=='string'||password.length<12||password.length>128) return res.status(400).json({error:'Enter your full name and a password of 12–128 characters.'});
  let claims;
  try {claims=jwt.verify(registrationToken,tokenSecret,{algorithms:['HS256'],issuer:'supportdesk',audience:'registration'});if(claims.purpose!=='register') throw new Error();} catch{return res.status(401).json({error:'Verification expired. Please verify your email again.'});}
  const hash=await hashPassword(password);
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const consumed=await client.query(`DELETE FROM email_verifications WHERE email=$1 AND registration_id=$2 AND verified_at > now()-interval '15 minutes' RETURNING email`,[claims.email,claims.jti]);
    if(!consumed.rowCount){await client.query('ROLLBACK');return res.status(401).json({error:'Please verify your email again.'});}
    const organization=await client.query('INSERT INTO organizations DEFAULT VALUES RETURNING id');
    const organizationId=organization.rows[0].id;
    await client.query('INSERT INTO users(id,email,full_name,password_hash,username,organization_id,role) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),claims.email,fullName,hash,username,organizationId,'admin']);
    await client.query('COMMIT');res.status(201).json({message:'Account created.',organizationId});
  }catch(error){await client.query('ROLLBACK');if(error.code==='23505')return res.status(409).json({error:'Email or username already exists. Please choose another username or log in.'});throw error;}finally{client.release();}
});
const dummyHash=await hashPassword(randomBytes(32).toString('hex'));
app.post('/api/auth/login',async(req,res)=>{
  const identifier=normalizeEmail(req.body.identifier ?? req.body.email), password=req.body.password;
  if((!validEmail(identifier)&&!validUsername(identifier))||typeof password!=='string'||!password.length||password.length>128)return res.status(400).json({error:'Enter your username or email and password.'});
  const {rows}=await pool.query('SELECT * FROM users WHERE email=$1 OR lower(username)=$1',[identifier]);
  const user=rows[0];
  const valid=await checkPassword(password,user?.password_hash||dummyHash);
  if(!user||!valid)return res.status(401).json({error:'Username, email or password is incorrect.'});
  const token=randomBytes(32).toString('hex');
  await pool.query(`INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')`,[sessionHash(token),user.id]);
  res.cookie('session',token,{...cookieOptions,maxAge:86400000});
  res.json({user:publicUser(await menuAccess(pool,user))});
});
app.get('/api/auth/me',async(req,res)=>{
  const {rows}=await pool.query('SELECT u.id,u.email,u.full_name,u.username,u.organization_id,u.role,u.menu_role_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',[sessionHash(sessionCookie(req))]);
  if(!rows[0])return res.status(401).json({error:'Please log in.'});
  res.json({user:publicUser(await menuAccess(pool,rows[0]))});
});
app.post('/api/auth/logout',async(req,res)=>{await pool.query('DELETE FROM sessions WHERE token_hash=$1',[sessionHash(sessionCookie(req))]);res.clearCookie('session',cookieOptions);res.json({message:'Signed out.'});});
}

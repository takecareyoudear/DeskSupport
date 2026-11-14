import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import Home from './Home';
import PasswordRecovery from './PasswordRecovery';

const API = import.meta.env.DEV ? (import.meta.env.VITE_API_URL || 'http://localhost:4000') : '';
function App() {
  const [mode, setMode] = useState('register');
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [user, setUser] = useState(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => { const controller = new AbortController(); fetch(`${API}/api/auth/me`, {credentials:'include',signal:controller.signal}).then(response=>response.ok?response.json():null).then(data=>{if(data?.user)setUser(data.user);}).catch(()=>{}); return ()=>controller.abort(); }, []);
  async function request(path, body) {
    const response = await fetch(`${API}/api/auth/${path}`, {method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }
  function switchMode(next) { setMode(next); setStep(0); setError(''); setNotice(''); setPassword(''); setConfirm(''); setOtp(''); setToken(''); }
  async function sendCode() { await request('send-otp', {email}); setStep(1); setNotice('A verification code has been sent. Check your inbox and spam folder.'); }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'login') { const data = await request('login', {email,password}); setUser(data.user); }
      else if (step === 0) await sendCode();
      else if (step === 1) { const data = await request('verify-otp', {email,otp}); setToken(data.registrationToken); setStep(2); }
      else { if (password !== confirm) throw new Error('Your passwords do not match.'); await request('register', {registrationToken:token,fullName:name,password}); switchMode('login'); setNotice('Account created. Sign in to get started.'); }
    } catch (err) { setError(err instanceof TypeError ? 'Cannot reach the server. Please check your connection and try again.' : err.message); }
    finally { setBusy(false); }
  }
  async function resend() { setBusy(true); setError(''); try { await sendCode(); } catch(err) { setError(err.message); } finally { setBusy(false); } }
  if (user) return <Home user={user} onLogout={async () => { await request('logout', {}); setUser(null); setPassword(''); }} />;
  return <div className="page"><aside className="story"><a className="brand" href="/" aria-label="SupportDesk home"><span className="brand-icon">s<span>·</span></span> SupportDesk</a><div className="story-content"><span className="eyebrow"><span className="dot"/> A BETTER WAY TO SUPPORT</span><h1>Every question.<br/>A step closer<br/>to <em>resolved.</em></h1><p>A little less back-and-forth. A lot more progress.<br/>Your team's support, all in one place.</p><div className="ticket-art" aria-hidden="true"><div className="art-top"><span className="mini-icon">✓</span><span>One place. Every conversation.</span><span className="art-dots">•••</span></div><div className="art-row"><span className="avatar">JD</span><div><strong>We're here to help.</strong><span>Your next great support experience starts here.</span></div></div><div className="art-bottom"><span className="resolved">✓ &nbsp; Resolved</span><span>That's the feeling.</span></div></div><div className="benefits"><span>✓ &nbsp; Stay organized</span><span>✓ &nbsp; Keep things moving</span></div></div><div className="story-footer">Built for people. Made for progress.<span>↗</span></div></aside><main><header><span>YOUR SUPPORT WORKSPACE</span><a href="mailto:support@example.com" onClick={e=>{e.preventDefault();setNotice('Your support contact will be added when the workspace is configured.');}}>Need help? <span>↗</span></a></header><section className="auth">{mode==='recovery' ? <PasswordRecovery request={request} initialEmail={email} onBack={message=>{switchMode('login');if(message)setNotice(message);}}/> : user ? <><span className="welcome-icon">✓</span><h2>Welcome, {user.fullName.split(' ')[0]}.</h2><p className="subtitle">You're signed in to SupportDesk.</p><div className="notice">Your account is ready. The ticket workspace will be added in the next stage.</div><button className="primary" onClick={async()=>{await request('logout',{});setUser(null);setPassword('');}}>Sign out</button></> : <><div className="tabs" aria-label="Account access"><button className={mode==='login'?'active':''} onClick={()=>switchMode('login')}>Log in</button><button className={mode==='register'?'active':''} onClick={()=>switchMode('register')}>Create account</button></div><span className="welcome-icon">{mode==='login'?'↗':step===1?'✉':'✦'}</span><h2>{mode==='login'?'Good to see you again.':step===0?'Great support starts here.':step===1?'Check your inbox.':'Make yourself at home.'}</h2><p className="subtitle">{mode==='login'?'Sign in to pick up where you left off.':step===0?'Create your account. Let’s get you connected.':step===1?`Enter the 6-digit code sent to ${email}.`:'One last step. Add your name and choose a password.'}</p>{mode==='register'&&<div className="steps">{['Email','Verify','Your details'].map((label,i)=><React.Fragment key={label}>{i>0&&<span className="step-line"/>}<span className={`step ${i<=step?'current':''}`} aria-current={i===step?'step':undefined}><b>{i<step?'✓':i+1}</b>{label}</span></React.Fragment>)}</div>}<form onSubmit={submit}>{(mode==='login'||step===0)&&<label>Email address<input type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={254}/></label>}{mode==='register'&&step===1&&<label>Verification code<input className="otp" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,''))} required autoFocus/></label>}{mode==='register'&&step===2&&<label>Full name<input autoComplete="name" placeholder="Your full name" value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={100} required/></label>}{(mode==='login'||step===2)&&<><label>Password<div className="password"><input type={visible?'text':'password'} autoComplete={mode==='login'?'current-password':'new-password'} placeholder={mode==='login'?'Enter your password':'Create a strong password'} value={password} onChange={e=>setPassword(e.target.value)} minLength={mode==='login'?1:12} maxLength={128} required/><button type="button" aria-label={visible?'Hide password':'Show password'} onClick={()=>setVisible(!visible)}>{visible?'Hide':'Show'}</button></div></label>{mode==='register'&&<><p className="hint">Use at least 12 characters.</p><label>Confirm password<input type="password" autoComplete="new-password" placeholder="Enter your password again" value={confirm} onChange={e=>setConfirm(e.target.value)} required maxLength={128}/></label></>}</>}{mode==='login'&&<div className="forgot-password"><button type="button" onClick={()=>switchMode('recovery')}>Forgot password?</button></div>}{error&&<div role="alert" className="error">{error}</div>}{notice&&<div role="status" className="notice">{notice}</div>}<button className="primary" disabled={busy}>{busy?'Please wait…':mode==='login'?'Log in':step===0?'Send verification code':step===1?'Verify email':'Create account'}<span aria-hidden="true">→</span></button>{mode==='register'&&step===0&&<p className="hint centered">We'll email you a code to verify it's really you.</p>}{mode==='register'&&step===1&&<div className="code-actions"><button type="button" onClick={()=>{setStep(0);setNotice('');setOtp('');}}>Change email</button><button type="button" disabled={busy} onClick={resend}>Resend code</button></div>}</form><p className="switch">{mode==='login'?'New around here?':'Already have an account?'} <button onClick={()=>switchMode(mode==='login'?'register':'login')}>{mode==='login'?'Create an account':'Log in'} <span>↗</span></button></p><div className="secure"><span>◇</span> Your workspace starts with a secure account.</div></>}</section><footer><span>© {new Date().getFullYear()} SupportDesk</span><span>Simple. Connected. Supported.</span></footer></main></div>;
}
createRoot(document.getElementById('root')).render(<App/>);

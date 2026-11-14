import React, { useEffect, useState } from 'react';

export default function PasswordRecovery({ request, onBack, initialEmail }) {
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(value => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  async function send() {
    const data = await request('forgot-password', { email });
    setSent(true); setNotice(data.message); setCooldown(60);
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      if (!sent) await send();
      else {
        if (password !== confirm) throw new Error('Your passwords do not match.');
        const data = await request('reset-password', { email, otp, password });
        onBack(data.message);
      }
    } catch (err) { setError(err instanceof TypeError ? 'Cannot reach the server. Please try again.' : err.message); }
    finally { setBusy(false); }
  }
  async function resend() {
    setBusy(true); setError(''); setNotice('');
    try { await send(); } catch (err) { setError(err instanceof TypeError ? 'Cannot reach the server. Please try again.' : err.message); }
    finally { setBusy(false); }
  }
  return <>
    <button className="recovery-back" onClick={() => onBack()}>← Back to log in</button>
    <span className="welcome-icon" aria-hidden="true">↺</span>
    <h2>{sent ? 'Choose a fresh start.' : 'Forgot your password?'}</h2>
    <p className="subtitle">{sent ? `Enter the code sent to ${email} and choose a new password.` : 'Enter your account email. We’ll send you a code to reset your password.'}</p>
    <form onSubmit={submit}>
      {!sent ? <label>Email address<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@company.com" maxLength={254} required autoFocus/></label> : <>
        <label>Verification code<input key="reset-code" className="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, ''))} placeholder="000000" required autoFocus/></label>
        <p className="hint">Your code expires in 10 minutes.</p>
        <label>New password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} placeholder="Create a strong password" required/></label>
        <p className="hint">Use 12–128 characters.</p>
        <label>Confirm new password<input type="password" autoComplete="new-password" maxLength={128} value={confirm} onChange={event => setConfirm(event.target.value)} placeholder="Enter your new password again" required/></label>
      </>}
      {error && <div className="error" role="alert">{error}</div>}
      {notice && <div className="notice" role="status">{notice}</div>}
      <button className="primary" disabled={busy}>{busy ? 'Please wait…' : sent ? 'Reset password' : 'Send reset code'}<span aria-hidden="true">→</span></button>
      {sent && <div className="code-actions"><button type="button" disabled={busy} onClick={() => { setSent(false); setOtp(''); setPassword(''); setConfirm(''); setError(''); setNotice(''); }}>Change email</button><button type="button" disabled={busy || cooldown > 0} onClick={resend}>{cooldown ? `Resend in ${cooldown}s` : 'Resend code'}</button></div>}
    </form>
    <div className="secure">A successful reset signs out all existing sessions.</div>
  </>;
}

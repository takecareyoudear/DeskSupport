import React,{useEffect,useRef} from 'react';
export default function CompanyProfile({user,onBack}){
 const heading=useRef(null);
 useEffect(()=>{heading.current?.focus();},[]);
 return <main className="settings-main"><div className="settings-heading"><div><span className="launcher-eyebrow">YOUR ORGANIZATION</span><h1 ref={heading} tabIndex={-1}>Company Profile</h1><p>Organization ID <strong>{user.organizationId}</strong></p></div><button className="settings-button" onClick={onBack}>Back to workspace</button></div>
 <section className="settings-panel" aria-labelledby="company-overview-title"><h2 id="company-overview-title">Organization overview</h2><p className="settings-muted">Your company workspace and your access details.</p><dl className="company-profile-details"><div><dt>Organization ID</dt><dd>{user.organizationId}</dd></div><div><dt>Your name</dt><dd>{user.fullName}</dd></div><div><dt>Your email</dt><dd>{user.email}</dd></div><div><dt>Your access</dt><dd>{user.role==='admin'?'Admin':'User'}</dd></div></dl></section></main>;
}

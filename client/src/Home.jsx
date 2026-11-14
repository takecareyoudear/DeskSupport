import React, { useState } from 'react';
import AppArtwork from './AppArtwork';

const menus = [
  ['tickets', 'My tickets', 'Your support conversations', '#215bc4', 'ticket'],
  ['create', 'New ticket', 'Start a support request', '#087b57', 'plus'],
  ['inbox', 'Inbox', 'Updates and conversations', '#7540bd', 'chat'],
  ['knowledge', 'Knowledge base', 'Find answers and guides', '#a65b08', 'book'],
  ['activity', 'Activity', 'Your latest workspace activity', '#ba3564', 'activity'],
  ['team', 'Team', 'People in your workspace', '#087b90', 'team'],
  ['reports', 'Reports', 'Support insights and trends', '#4d50bc', 'chart'],
  ['settings', 'Settings', 'Make the workspace yours', '#914598', 'settings'],
];
function Icon({ name, ...props }) {
  const paths = {
    ticket: <><path d="M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4Z"/><path d="M15 7v3m0 4v5"/></>,
    plus: <><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8m-4-4h8"/></>,
    chat: <path d="M20 11a7 7 0 0 1-7 7H9l-5 3v-6a7 7 0 0 1 6-11h3a7 7 0 0 1 7 7Z"/>,
    book: <><path d="M12 6C9 4 6 4 3 5v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v14"/></>,
    activity: <><path d="M3 12h4l3-7 4 14 3-7h4"/></>,
    team: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"/></>,
    chart: <><path d="M4 4v16h17M9 15v-4m5 4V7m5 8v-6"/></>,
    settings: <><path d="m10 3-1 3-3 1-3 3 2 2-1 4 3 2 3-1 2 4 3-1 1-3 4-1 1-4-3-2V6l-4-2-2 2Z"/><circle cx="12" cy="12" r="3"/></>,
    search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,
    home: <><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"/></>,
    exit: <><path d="M10 4H4v16h6m5-13 5 5-5 5m-7-5h12"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.ticket}</svg>;
}

export default function Home({ user, onLogout }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState('');
  const initials = user.fullName.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('');
  async function logout() {
    setLoggingOut(true); setError('');
    try { await onLogout(); } catch { setError('Could not sign out. Please try again.'); setLoggingOut(false); }
  }
  return <div className="launcher">
    <div className="launcher-shell">
      <header className="launcher-header">
        <a href="/" className="launcher-brand"><span className="launcher-mark">s<span>·</span></span><span>SupportDesk<small>YOUR WORKSPACE, CONNECTED</small></span></a>
        <label className="launcher-search"><Icon name="search"/><input aria-label="Search apps" placeholder="Find an app…" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button aria-label="Clear search" onClick={() => setQuery('')}>×</button>}</label>
        <div className="launcher-account"><span className="online-status">Workspace online</span><button className="profile-button" title={user.fullName} aria-label={`View profile for ${user.fullName}`} onClick={() => setSelected(['profile', 'Your profile', '', '#087b57', 'team'])}>{initials}</button></div>
      </header>
      <main className="launcher-main">
        <div className="launcher-intro"><span className="launcher-eyebrow">A LITTLE CLARITY. A LOT OF PROGRESS.</span><h1>Hello, {user.fullName.trim().split(/\s+/)[0]}<span>.</span></h1><p>Everything you need. One place to begin.</p></div>
        <div className="apps-heading"><h2>Your workspace</h2><span>{query ? 'Search results' : 'Choose an app to get started'}</span></div>
        <div className="app-grid">{menus.filter(menu => `${menu[1]} ${menu[2]}`.toLowerCase().includes(query.toLowerCase())).map(menu => <button key={menu[0]} className="app-tile" style={{'--tile-color':menu[3]}} onClick={() => setSelected(menu)}><span className="app-icon"><AppArtwork name={menu[4]}/></span><span className="app-name">{menu[1]}</span><span className="app-description">{menu[2]}</span><span className="tile-arrow" aria-hidden="true">↗</span></button>)}</div>
        {query && !menus.some(menu => `${menu[1]} ${menu[2]}`.toLowerCase().includes(query.toLowerCase())) && <p className="empty-search" role="status">No apps found for “{query}”. Try another name.</p>}
        {error && <p className="launcher-error" role="alert">{error}</p>}
      </main>
      <footer className="launcher-footer"><span>Simple. Connected. Supported.</span><nav className="launcher-dock" aria-label="Workspace shortcuts"><button className="dock-active" aria-label="Home" onClick={() => { setQuery(''); setSelected(null); }}><Icon name="home"/></button>{[menus[0], menus[1], menus[3]].map(menu => <button key={menu[0]} aria-label={menu[1]} style={{color:menu[3]}} onClick={() => setSelected(menu)}><Icon name={menu[4]}/></button>)}<span className="dock-divider"/><button aria-label="Sign out" title="Sign out" disabled={loggingOut} onClick={logout}><Icon name="exit"/></button></nav><span>SupportDesk · Your space to resolve</span></footer>
    </div>
    {selected && <div className="app-modal-backdrop" onClick={() => setSelected(null)}><section className="app-modal" role="dialog" aria-modal="true" aria-labelledby="app-modal-title" onClick={event => event.stopPropagation()} onKeyDown={event => {if(event.key === 'Escape') setSelected(null);}}><span className="modal-icon" style={{color:selected[3]}}><Icon name={selected[4]}/></span><h2 id="app-modal-title">{selected[1]}</h2>{selected[0] === 'profile' ? <><p>{user.fullName}</p><p>{user.email}</p></> : <p>This app is coming soon. Your workspace is ready; {selected[1].toLowerCase()} will be available when this module is connected.</p>}<button autoFocus onClick={() => setSelected(null)}>Back to workspace</button></section></div>}
  </div>;
}

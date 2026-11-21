import React, { useEffect,useState } from 'react';
import {canAccess} from '../../server/src/menu-catalog.js';
import AppArtwork from './AppArtwork';
import Settings from './Settings';
import Assets from './Assets';
import Payables from './Payables';
import Tickets from './Tickets';
import WorkspaceDrawer from './WorkspaceDrawer';
import CompanyProfile from './CompanyProfile';

const API=import.meta.env.DEV?(import.meta.env.VITE_API_URL||''):'';
const menus = [
  ['tickets', 'My tickets', 'Your support conversations', '#215bc4', 'ticket'],
  ['create', 'New ticket', 'Start a support request', '#087b57', 'plus'],
  ['inbox', 'Inbox', 'Updates and conversations', '#7540bd', 'chat'],
  ['knowledge', 'Knowledge base', 'Find answers and guides', '#a65b08', 'book'],
  ['activity', 'Activity', 'Your latest workspace activity', '#ba3564', 'activity'],
  ['team', 'Team', 'People in your workspace', '#087b90', 'team'],
  ['reports', 'Reports', 'Support insights and trends', '#4d50bc', 'chart'],
  ['assets', 'Assets', 'Assets, subscriptions and insurance', '#087b90', 'assets'],
  ['payble', 'Payble', 'Bills and recurring expenses', '#a65b08', 'payble'],
  ['settings', 'System Settings', 'Make the workspace yours', '#914598', 'settings'],
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
    assets: <><path d="m3 7 9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10"/></>,
    search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,
    home: <><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"/></>,
    exit: <><path d="M10 4H4v16h6m5-13 5 5-5 5m-7-5h12"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.ticket}</svg>;
}

export default function Home({ user:initialUser, onLogout }) {
  const [user,setUser]=useState(initialUser);
  const [drawerOpen,setDrawerOpen]=useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(menus[0]);
  const [newTicket, setNewTicket] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState('');
  const visibleMenus=menus.filter(menu=>canAccess(user,menu[0]));
  useEffect(()=>{
    const controller=new AbortController();
    let pending=false;
    async function refresh(){if(pending)return;pending=true;try{const response=await fetch(`${API}/api/auth/me`,{credentials:'include',signal:controller.signal});if(response.status===401){window.location.reload();return;}if(response.ok){const data=await response.json();setUser(data.user);}}catch{}finally{pending=false;}}
    const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);refresh();
    return()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[]);
  useEffect(()=>{if(selected&&selected[0]!=='profile'&&!canAccess(user,selected[0]))setSelected(null);},[user,selected]);
  const initials = user.fullName.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('');
  async function logout() {
    setLoggingOut(true); setError('');
    try { await onLogout(); } catch { setError('Could not sign out. Please try again.'); setLoggingOut(false); }
  }
  return <div className="launcher">
    <div className="launcher-shell">
      <header className="launcher-header"><button className="drawer-toggle" aria-label="Open navigation menu" aria-expanded={drawerOpen} aria-controls="workspace-drawer" onClick={()=>setDrawerOpen(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
        <a href="/" className="launcher-brand"><span className="launcher-mark">s<span>·</span></span><span>SupportDesk<small>YOUR WORKSPACE, CONNECTED</small></span></a>
        <label className="launcher-search"><Icon name="search"/><input aria-label="Search apps" placeholder="Find an app…" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button aria-label="Clear search" onClick={() => setQuery('')}>×</button>}</label>
        <div className="launcher-account"><span className="online-status">Workspace online</span><button className="profile-button" title={user.fullName} aria-label={`View profile for ${user.fullName}`} onClick={() => setSelected(['profile', 'Your profile', '', '#087b57', 'team'])}>{initials}</button></div>
      </header>
      {['tickets','create'].includes(selected?.[0]) && canAccess(user,selected[0]) ? <Tickets
        key={selected[0]} user={user} mode={selected[0]} newTicket={newTicket}
        onBack={()=>{setNewTicket(null);setSelected(null);}}
        onCreate={()=>{setNewTicket(null);setSelected(menus[1]);}}
        onCreated={id=>{setNewTicket(id);setSelected(menus[0]);}}
      /> : selected?.[0]==='settings'&&canAccess(user,'settings') ? <Settings key={`${user.role}:${(user.menus||[]).join(',')}`} user={user} onBack={()=>setSelected(null)}/> : selected?.[0]==='assets'&&canAccess(user,'assets') ? <Assets key={`${user.role}:${(user.menus||[]).join(',')}`} user={user} onBack={()=>setSelected(null)}/> : selected?.[0]==='payble'&&canAccess(user,'payble') ? <Payables key={`${user.role}:${(user.menus||[]).join(',')}`} user={user} onBack={()=>setSelected(null)}/> : selected?.[0]==='company'&&canAccess(user,'company') ? <CompanyProfile key={`${user.role}:${(user.menus||[]).join(',')}`} user={user} onBack={()=>setSelected(null)}/> : <main className="launcher-main">
        <div className="launcher-intro"><span className="launcher-eyebrow">A LITTLE CLARITY. A LOT OF PROGRESS.</span><h1>Hello, {user.fullName.trim().split(/\s+/)[0]}<span>.</span></h1><p>Everything you need. One place to begin.</p></div>
        <div className="apps-heading"><h2>Your workspace</h2><span>{query ? 'Search results' : 'Choose an app to get started'}</span></div>
        <div className="app-grid">{visibleMenus.filter(menu => `${menu[1]} ${menu[2]}`.toLowerCase().includes(query.toLowerCase())).map(menu => <button key={menu[0]} className="app-tile" style={{'--tile-color':menu[3]}} onClick={() => {setNewTicket(null);setSelected(menu);}}><span className="app-icon"><AppArtwork name={menu[4]}/></span><span className="app-name">{menu[1]}</span><span className="app-description">{menu[2]}</span><span className="tile-arrow" aria-hidden="true">↗</span></button>)}</div>
        {!visibleMenus.length&&<p className="empty-search">No menus are assigned to your account. Contact your admin to assign a menu role.</p>}
        {query && visibleMenus.length>0 && !visibleMenus.some(menu => `${menu[1]} ${menu[2]}`.toLowerCase().includes(query.toLowerCase())) && <p className="empty-search" role="status">No apps found for “{query}”. Try another name.</p>}
        {error && <p className="launcher-error" role="alert">{error}</p>}
      </main>}
      <footer className="launcher-footer"><span>Simple. Connected. Supported.</span><nav className="launcher-dock" aria-label="Workspace shortcuts"><button className="dock-active" aria-label="Home" onClick={() => { setQuery(''); setSelected(null); }}><Icon name="home"/></button>{[menus[0], menus[1], menus[3]].filter(menu=>canAccess(user,menu[0])).map(menu => <button key={menu[0]} aria-label={menu[1]} style={{color:menu[3]}} onClick={() => {setNewTicket(null);setSelected(menu);}}><Icon name={menu[4]}/></button>)}<span className="dock-divider"/><button aria-label="Sign out" title="Sign out" disabled={loggingOut} onClick={logout}><Icon name="exit"/></button></nav><span>SupportDesk · Your space to resolve</span></footer>
    </div>
    {drawerOpen&&<WorkspaceDrawer canCompany={canAccess(user,'company')} organizationId={user.organizationId} onClose={()=>setDrawerOpen(false)} onNavigate={page=>{setSelected(page?['company']:null);setQuery('');setDrawerOpen(false);}}/>}
    {selected && !['tickets','create','settings','assets','payble','company'].includes(selected[0]) && <div className="app-modal-backdrop" onClick={() => setSelected(null)}><section className="app-modal" role="dialog" aria-modal="true" aria-labelledby="app-modal-title" onClick={event => event.stopPropagation()} onKeyDown={event => {if(event.key === 'Escape') setSelected(null);}}><span className="modal-icon" style={{color:selected[3]}}><Icon name={selected[4]}/></span><h2 id="app-modal-title">{selected[1]}</h2>{selected[0] === 'profile' ? <><p>{user.fullName}</p><p>{user.email}</p><p>Username: {user.username}</p><p>Organization ID: {user.organizationId}</p></> : <p>This app is coming soon. Your workspace is ready; {selected[1].toLowerCase()} will be available when this module is connected.</p>}<button autoFocus onClick={() => setSelected(null)}>Back to workspace</button></section></div>}
  </div>;
}

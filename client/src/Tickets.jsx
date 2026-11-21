import React, { useEffect, useRef, useState } from 'react';
import {canAccess} from '../../server/src/menu-catalog.js';
import './tickets.css';

const API = import.meta.env.DEV ? (import.meta.env.VITE_API_URL || '') : '';
async function request(path = '', body, signal) {
  const response = await fetch(`${API}/api/auth/workspace/tickets${path}`, {
    credentials: 'include', signal,
    ...(body && {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)})
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'Could not load tickets.');
    error.status = response.status;
    throw error;
  }
  return data;
}

const selectors = [
  ['department_id','Department','departments'], ['category_id','Category','categories'],
  ['project_id','Project','projects'], ['assignee_id','Assignee','users']
];
const dates = [['entered_date','Entered date'],['due_date','Due date'],['reminder_date','Reminder date']];
const today = () => {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0')].join('-');
};

function TicketForm({ticket, onSaved, onCancel}) {
  const [values,setValues] = useState(() => ({
    title:'', description:'', department_id:'', category_id:'', project_id:'', assignee_id:'',
    priority:'Medium', entered_date:today(), due_date:'', reminder_date:'', ...ticket
  }));
  const [options,setOptions] = useState(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    request(ticket ? `/options?ticket=${ticket.id}` : '/options', undefined, controller.signal)
      .then(setOptions).catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();
  }, [ticket?.id]);
  const bind = key => ({value:values[key], onChange:e => setValues({...values,[key]:e.target.value})});
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const keys = ['title','description','priority', ...selectors.map(([key]) => key), ...dates.map(([key]) => key)];
    const payload = Object.fromEntries(keys.map(key => [key,values[key]]));
    if (ticket) payload.revision = values.revision;
    try {
      onSaved((await request(ticket ? `/${ticket.id}/update` : '', payload)).id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const missingMasters = options && selectors.some(([, , list]) => !options[list].length);
  return <form className="ticket-form" onSubmit={save}>
    <label>Title<input {...bind('title')} required maxLength={160}/></label>
    <label>Description<textarea {...bind('description')} maxLength={2000} rows={3}/></label>
    <div className="ticket-fields">
      {selectors.map(([key,label,list]) => <label key={key}>{label}<select {...bind(key)} required disabled={!options}><option value="">Choose {label.toLowerCase()}</option>{options?.[list].map(item => <option key={item.id} value={item.id}>{item.name}{item.username ? ` (@${item.username})` : ''}</option>)}</select></label>)}
      <label>Priority<select {...bind('priority')}>{['High','Medium','Low'].map(priority => <option key={priority}>{priority}</option>)}</select></label>
      {dates.map(([key,label]) => <label key={key}>{label}<input {...bind(key)} type="date" required min={key === 'entered_date' ? undefined : values.entered_date} max={key === 'reminder_date' ? values.due_date || undefined : undefined}/></label>)}
    </div>
    {missingMasters && <p role="status">Add the missing options in System Settings before saving a ticket.</p>}
    {error && <p className="ticket-error" role="alert">{error}</p>}
    <div className="ticket-actions"><button type="button" onClick={onCancel} disabled={busy}>Cancel</button><button className="ticket-primary" disabled={busy || !options || missingMasters}>{busy ? 'Saving…' : ticket ? 'Save changes' : 'Create ticket'}</button></div>
  </form>;
}

function TicketThread({id,user,onBack,onChanged}) {
  const [data,setData] = useState(null);
  const [editing,setEditing] = useState(false);
  const [feedback,setFeedback] = useState('');
  const [error,setError] = useState('');
  const [loadError,setLoadError] = useState('');
  const [busy,setBusy] = useState(false);
  const [refresh,setRefresh] = useState(0);
  const thread = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function load() {
      if (pending) return;
      pending = true;
      try {
        setData(await request(`/${id}`, undefined, controller.signal));
        setLoadError('');
      } catch (err) {
        if (err.name !== 'AbortError') {
          if ([401,403,404].includes(err.status)) setData(null);
          setLoadError(err.message);
        }
      } finally {
        pending = false;
      }
    }
    load();
    const timer = setInterval(load, 15000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [id,refresh]);
  const eventCount = data?.events.length;
  useEffect(() => {
    if (thread.current) thread.current.scrollTop = thread.current.scrollHeight;
  }, [eventCount, editing]);
  function changed() {
    setError('');
    setRefresh(value => value+1);
    onChanged();
  }
  async function send(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await request(`/${id}/feedback`, {feedback});
      setFeedback('');
      changed();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return <section className="ticket-panel">
    <button className="ticket-back" onClick={onBack}>← My tickets</button>
    {data && <>
      <div className="ticket-heading"><h2>{data.ticket.title}</h2>{!editing && <button onClick={() => setEditing(true)}>Edit details</button>}</div>
      {editing ? <TicketForm ticket={data.ticket} onCancel={() => setEditing(false)} onSaved={() => {setEditing(false); changed();}}/> : <>
        <dl className="ticket-details">{[...selectors.map(([key,label]) => [`${key}_label`,label]),['priority','Priority'],...dates].map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{data.ticket[key]}</dd></div>)}</dl>
        <h3>Conversation</h3>
        <ol className="ticket-thread" ref={thread} aria-label="Ticket conversation">
          {data.events.map(event => <li key={event.id} className={event.kind === 'update' ? 'ticket-event' : event.actor_id === user.id ? 'ticket-mine' : 'ticket-reply'}>
            <div><strong>{event.actor_name}</strong><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time></div>
            <p>{event.body}</p>
          </li>)}
        </ol>
        <form className="ticket-compose" onSubmit={send}>
          <label>Feedback<textarea value={feedback} onChange={event => setFeedback(event.target.value)} maxLength={2000} rows={2} required/></label>
          <button className="ticket-primary" disabled={busy || !feedback.trim()}>Send feedback</button>
        </form>
      </>}
    </>}
    {!data && !loadError && <p role="status">Loading ticket…</p>}
    {loadError && <p className="ticket-error" role="alert">{loadError}</p>}
    {error && <p className="ticket-error" role="alert">{error}</p>}
  </section>;
}

export default function Tickets({user, mode, onBack, onCreate, onCreated, newTicket}) {
  const [tickets,setTickets] = useState(null);
  const [tab,setTab] = useState('assigned');
  const [selected,setSelected] = useState(newTicket);
  const [refresh,setRefresh] = useState(0);
  const [error,setError] = useState('');
  const admin = user.role === 'admin';
  useEffect(() => {
    if (mode === 'create') return;
    const controller = new AbortController();
    const load = () => request('', undefined, controller.signal)
      .then(data => {setTickets(data.tickets); setError('');})
      .catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    load();
    const timer = setInterval(load,15000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [mode,refresh]);
  const shown = tickets?.filter(ticket => tab === 'assigned' ? ticket.assignee_id === user.id : tab === 'created' ? ticket.creator_id === user.id : admin);
  return <main className="launcher-main tickets-workspace">
    <button className="ticket-back" onClick={onBack}>← Workspace</button>
    <div className="ticket-heading"><h1>{mode === 'create' ? 'New ticket' : 'My tickets'}</h1>{mode !== 'create' && canAccess(user,'create') && <button className="ticket-primary" onClick={onCreate}>New ticket</button>}</div>
    {mode === 'create' ? <section className="ticket-panel"><TicketForm onCancel={onBack} onSaved={onCreated}/></section> : selected ? <TicketThread key={selected} id={selected} user={user} onBack={() => setSelected(null)} onChanged={() => setRefresh(value => value+1)}/> :
      <section className="ticket-panel">
        <div className="ticket-tabs" aria-label="Ticket filters">{[['assigned','Assigned to me'],['created','Created by me'],...(admin ? [['all','All tickets']] : [])].map(([key,label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</div>
        {error && <p className="ticket-error" role="alert">{error}</p>}
        {!shown && !error && <p role="status">Loading tickets…</p>}
        {shown?.length === 0 && <p>No tickets in this view.</p>}
        <ul className="ticket-list">{shown?.map(ticket => <li key={ticket.id}><button onClick={() => setSelected(ticket.id)}>
          <strong>{ticket.title}</strong><span>{ticket.assignee_id_label} · Due {ticket.due_date} · Reminder {ticket.reminder_date}</span><span className="ticket-priority" data-priority={ticket.priority}>{ticket.priority}</span>
        </button></li>)}</ul>
      </section>}
  </main>;
}

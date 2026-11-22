import React, { useEffect, useRef, useState } from 'react';
import {canAccess} from '../../server/src/menu-catalog.js';
import TicketReport from './TicketReport';
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
const dateFromToday = (days = 0) => {
  const now = new Date();
  now.setDate(now.getDate() + days);
  return [now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0')].join('-');
};
const dateShortcuts = {
  entered_date: [[0,'Today']],
  due_date: [[7,'In 1 week'],[30,'In 30 days']],
  reminder_date: [[1,'Tomorrow'],[7,'In 1 week']]
};

function TicketForm({ticket, onSaved, onCancel}) {
  const [values,setValues] = useState(() => ({
    title:'', description:'', department_id:'', category_id:'', project_id:'', assignee_id:'',
    priority:'Medium', entered_date:dateFromToday(), due_date:'', reminder_date:'', ...ticket
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
  const change = (key,value) => setValues(previous => ({...previous,[key]:value}));
  const bind = key => ({value:values[key], onChange:e => change(key,e.target.value)});
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
  const missingOptions = options ? selectors.filter(([, , list]) => !options[list].length).map(([,label]) => label.toLowerCase()) : [];
  return <form className="ticket-form" onSubmit={save}>
    <fieldset className="ticket-form-section">
      <legend>Ticket details</legend>
      <label>Title<input {...bind('title')} placeholder="e.g. Reception printer is offline" required maxLength={160}/></label>
      <label><span>Description <small>Optional</small></span><textarea {...bind('description')} placeholder="Describe what happened and include any details the assignee needs." maxLength={2000} rows={3}/></label>
    </fieldset>
    <fieldset className="ticket-form-section">
      <legend>Assignment</legend>
      <div className="ticket-assignment-fields">
        {selectors.map(([key,label,list]) => <label key={key}>{label}<select {...bind(key)} required disabled={!options || !options[list].length}>
          <option value="">{!options ? 'Loading options…' : options[list].length ? `Select ${label.toLowerCase()}` : 'No options available'}</option>
          {options?.[list].map(item => <option key={item.id} value={item.id}>{item.name}{item.username ? ` (@${item.username})` : ''}</option>)}
        </select></label>)}
      </div>
      {missingOptions.length > 0 && <p className="ticket-form-note" role="status">Add options in System Settings for {missingOptions.join(', ')} before saving.</p>}
      <fieldset className="ticket-priority-control">
        <legend>Priority</legend>
        <div>{['Low','Medium','High'].map(priority => <label key={priority} data-priority={priority}>
          <input type="radio" name="priority" value={priority} checked={values.priority === priority} onChange={() => change('priority',priority)}/>{priority}
        </label>)}</div>
      </fieldset>
    </fieldset>
    <fieldset className="ticket-form-section">
      <legend>Schedule</legend>
      <div className="ticket-date-fields">
        {dates.map(([key,label]) => <div key={key}>
          <label>{label}<input {...bind(key)} type="date" required/></label>
          <div className="ticket-date-shortcuts">
            {dateShortcuts[key].map(([days,caption]) => <button type="button" key={days} aria-label={`${label}: ${caption}`} aria-pressed={values[key] === dateFromToday(days)} onClick={() => change(key,dateFromToday(days))}>{caption}</button>)}
          </div>
        </div>)}
      </div>
    </fieldset>
    {error && <p className="ticket-error" role="alert">{error}</p>}
    <div className="ticket-actions"><button type="button" onClick={onCancel} disabled={busy}>Cancel</button><button className="ticket-primary" disabled={busy || !options || missingOptions.length > 0}>{busy ? 'Saving…' : ticket ? 'Save changes' : 'Create ticket'}</button></div>
  </form>;
}

function TicketThread({id,user,onBack,onChanged,backLabel}) {
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
  async function toggleCompletion() {
    setBusy(true);
    setError('');
    try {
      await request(`/${id}/status`, {completed:!data.ticket.completed_at, revision:data.ticket.revision});
      changed();
    } catch (err) {
      if (err.status === 409) setRefresh(value => value+1);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return <section className="ticket-panel">
    <button className="ticket-back" onClick={onBack}>← {backLabel}</button>
    {data && <>
      <div className="ticket-heading"><h2>{data.ticket.title}</h2>{!editing && <div className="ticket-actions">
        <button disabled={busy} onClick={() => setEditing(true)}>Edit details</button>
        <button className="ticket-primary" disabled={busy} onClick={toggleCompletion}>{data.ticket.completed_at ? 'Reopen ticket' : 'Mark completed'}</button>
      </div>}</div>
      {editing ? <TicketForm ticket={data.ticket} onCancel={() => setEditing(false)} onSaved={() => {setEditing(false); changed();}}/> : <>
        <dl className="ticket-details">
          <div><dt>Status</dt><dd>{data.ticket.completed_at ? 'Completed' : 'Pending'}</dd></div>
          {[...selectors.map(([key,label]) => [`${key}_label`,label]),['priority','Priority'],...dates].map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{data.ticket[key]}</dd></div>)}
        </dl>
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
  const isReport = mode === 'reports';
  const heading = isReport ? 'Ticket reports' : mode === 'create' ? 'New ticket' : 'My tickets';
  useEffect(() => {
    if (mode === 'create') return;
    const controller = new AbortController();
    const load = () => request('', undefined, controller.signal)
      .then(data => {setTickets(data.tickets); setError('');})
      .catch(err => {
        if (err.name === 'AbortError') return;
        if ([401,403].includes(err.status)) setTickets(null);
        setError(err.message);
      });
    load();
    const timer = setInterval(load,15000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [mode,refresh,user.id,user.role]);
  const shown = tickets?.filter(ticket => tab === 'assigned' ? ticket.assignee_id === user.id : tab === 'created' ? ticket.creator_id === user.id : admin);
  const reportTickets = admin ? tickets : tickets?.filter(ticket => ticket.assignee_id === user.id || ticket.creator_id === user.id);
  return <main className="launcher-main tickets-workspace">
    <button className="ticket-back" onClick={onBack}>← Workspace</button>
    <div className="ticket-heading"><h1>{heading}</h1>{mode === 'tickets' && canAccess(user,'create') && <button className="ticket-primary" onClick={onCreate}>New ticket</button>}</div>
    {isReport && <TicketReport tickets={reportTickets} error={error} onOpen={setSelected} today={dateFromToday()} nextWeek={dateFromToday(7)} hidden={Boolean(selected)}/>}
    {mode === 'create' ? <section className="ticket-panel"><TicketForm onCancel={onBack} onSaved={onCreated}/></section> : selected ? <TicketThread key={selected} id={selected} user={user} backLabel={heading} onBack={() => setSelected(null)} onChanged={() => setRefresh(value => value+1)}/> : !isReport &&
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

import React, {useState} from 'react';
import {matchesTicketView} from './ticket-report.mjs';

const scenarios = [
  ['all', 'All tickets', ''],
  ['pending', 'Pending', 'Includes overdue tickets'],
  ['completed', 'Completed', 'Marked complete'],
  ['overdue', 'Overdue', 'Pending and past due'],
  ['today', 'Due today', 'Pending'],
  ['upcoming', 'Due next 7 days', 'Pending, starting tomorrow']
];
const dimensions = [
  ['department_id', 'Department'], ['assignee_id', 'Assignee'], ['priority', 'Priority']
];

export default function TicketReport({tickets, error, onOpen, today, nextWeek, hidden}) {
  const [scenario, setScenario] = useState('all');
  const [filters, setFilters] = useState({});
  const matches = (ticket, key) => matchesTicketView(ticket,key,today,nextWeek);
  const scoped = tickets?.filter(ticket => dimensions.every(([key]) => !filters[key] || ticket[key] === filters[key]));
  const rows = scoped?.filter(ticket => matches(ticket,scenario)).sort((a,b) => scenario === 'completed'
    ? b.completed_at.localeCompare(a.completed_at)
    : a.due_date.localeCompare(b.due_date));
  return <section className="ticket-panel ticket-report" hidden={hidden} aria-label="Ticket report">
    <p className="ticket-report-note">Reporting date {today} · Counts reflect your ticket access and selected filters.</p>
    <div className="ticket-report-filters">
      {dimensions.map(([key,label]) => {
        const options = new Map((tickets || []).map(ticket => [ticket[key], ticket[`${key}_label`] ?? ticket[key]]));
        const value = filters[key] || '';
        if (value && !options.has(value)) options.set(value, 'No longer available');
        return <label key={key}>{label}<select value={value} onChange={event => setFilters({...filters,[key]:event.target.value})}>
          <option value="">Any</option>
          {[...options].sort((a,b) => a[1].localeCompare(b[1])).map(([id,name]) => <option key={id} value={id}>{name}</option>)}
        </select></label>;
      })}
      <button onClick={() => setFilters({})}>Clear filters</button>
    </div>
    {error && <p className="ticket-error" role="alert">{error}</p>}
    {!tickets && !error && <p role="status">Loading report…</p>}
    {rows && <>
      <div className="ticket-report-cards" role="group" aria-label="Report views">
        {scenarios.map(([key,label,hint]) => <button key={key} data-view={key} aria-pressed={key === scenario} onClick={() => setScenario(key)}>
          <span>{label}</span><strong>{scoped.filter(ticket => matches(ticket,key)).length}</strong>
          {hint && <small>{hint}</small>}
        </button>)}
      </div>
      <h2>{scenarios.find(([key]) => key === scenario)[1]}</h2>
      {rows.length === 0 ? <p role="status">No tickets match this view.</p> :
        <div className="ticket-report-table" tabIndex={0} role="region" aria-label="Ticket results">
          <table>
            <thead><tr>{['Ticket','Status','Priority','Department','Assignee','Due date','Completed'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>{rows.map(ticket => {
              const status = ticket.completed_at ? 'Completed' : matches(ticket,'overdue') ? 'Overdue' : 'Pending';
              return <tr key={ticket.id}>
                <td><button onClick={() => onOpen(ticket.id)}>{ticket.title}</button></td>
                <td><span className="ticket-report-status" data-status={status}>{status}</span></td>
                <td>{ticket.priority}</td><td>{ticket.department_id_label}</td><td>{ticket.assignee_id_label}</td>
                <td>{ticket.due_date}</td><td>{ticket.completed_at ? new Date(ticket.completed_at).toLocaleDateString() : '—'}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
    </>}
  </section>;
}

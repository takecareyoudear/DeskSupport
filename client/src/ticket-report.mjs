export function matchesTicketView(ticket, view, today, nextWeek) {
  if (view === 'all') return true;
  if (view === 'completed') return Boolean(ticket.completed_at);
  if (ticket.completed_at) return false;
  switch (view) {
    case 'pending': return true;
    case 'overdue': return ticket.due_date < today;
    case 'today': return ticket.due_date === today;
    case 'upcoming': return ticket.due_date > today && ticket.due_date <= nextWeek;
    default: return false;
  }
}

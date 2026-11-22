import { randomUUID } from 'node:crypto';
import { canAccess } from './menu-catalog.js';

const uuid = value => typeof value === 'string' && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value);
const date = value => typeof value === 'string' && /^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const fields = [
  ['title','Title'], ['description','Description'], ['department_id','Department'],
  ['category_id','Category'], ['project_id','Project'], ['assignee_id','Assignee'],
  ['priority','Priority'], ['entered_date','Entered date'], ['due_date','Due date'],
  ['reminder_date','Reminder date']
];
const columns = fields.map(([key]) => key).join(', ');
const selectFields = `t.*, t.entered_date::text AS entered_date, t.due_date::text AS due_date,
  t.reminder_date::text AS reminder_date, d.name AS department_id_label,
  c.name AS category_id_label, p.name AS project_id_label, u.full_name AS assignee_id_label`;
const joins = `FROM tickets t JOIN departments d ON d.id=t.department_id
  JOIN categories c ON c.id=t.category_id JOIN projects p ON p.id=t.project_id
  JOIN users u ON u.id=t.assignee_id`;
const selection = `SELECT ${selectFields} ${joins}`;

async function record(client, ticketId, account, kind, body) {
  await client.query('INSERT INTO ticket_events(ticket_id,actor_id,actor_name,kind,body) VALUES($1,$2,$3,$4,$5)',
    [ticketId, account.id, account.full_name, kind, body]);
}

export function registerTickets(app, {pool}) {
  const base = '/api/auth/workspace/tickets';
  const canCreate = account => canAccess({...account, menus: account.access_menus}, 'create');
  const visible = 't.organization_id=$1 AND ($3::boolean OR t.assignee_id=$2 OR t.creator_id=$2)';
  const scope = account => [account.organization_id, account.id, account.role === 'admin'];

  app.get(`${base}/options`, async (req, res) => {
    const org = req.account.organization_id;
    if (!canCreate(req.account)) {
      const id = req.query.ticket;
      if (!uuid(id) || !(await pool.query(`SELECT t.id FROM tickets t WHERE ${visible} AND t.id=$4`, [...scope(req.account), id])).rows.length) {
        return res.status(403).json({error:'Open a ticket you can edit to load its options.'});
      }
    }
    const options = {};
    for (const table of ['departments','categories','projects']) {
      options[table] = (await pool.query(`SELECT id,name FROM ${table} WHERE organization_id=$1 ORDER BY lower(name),id`, [org])).rows;
    }
    options.users = (await pool.query('SELECT id,full_name AS name,username FROM users WHERE organization_id=$1 ORDER BY lower(full_name),id', [org])).rows;
    res.json(options);
  });

  app.get(base, async (req, res) => {
    const {rows} = await pool.query(`${selection} WHERE ${visible} ORDER BY t.updated_at DESC,t.id`, scope(req.account));
    res.json({tickets: rows});
  });

  app.get(`${base}/:id`, async (req, res) => {
    if (!uuid(req.params.id)) return res.status(404).json({error:'Ticket not found.'});
    const {rows} = await pool.query(`SELECT ${selectFields}, COALESCE(history.events,'[]'::json) AS events ${joins}
      CROSS JOIN LATERAL (SELECT json_agg(e ORDER BY e.id) AS events FROM ticket_events e WHERE e.ticket_id=t.id) history
      WHERE ${visible} AND t.id=$4`,
    [...scope(req.account), req.params.id]);
    if (!rows[0]) return res.status(404).json({error:'Ticket not found.'});
    const {events, ...ticket} = rows[0];
    res.json({ticket, events});
  });

  async function save(req, res, action) {
    const account = req.account;
    const creating = action === 'create';
    const id = creating ? randomUUID() : req.params.id;
    if (creating && !canCreate(account)) return res.status(403).json({error:'Your role does not allow ticket creation.'});
    if (!uuid(id)) return res.status(404).json({error:'Ticket not found.'});

    const input = req.body;
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const description = typeof input.description === 'string' ? input.description.trim() : '';
    const feedback = typeof input.feedback === 'string' ? input.feedback.trim() : '';
    if (action === 'status') {
      if (typeof input.completed !== 'boolean') return res.status(400).json({error:'Choose whether the ticket is completed.'});
    } else if (action === 'feedback') {
      if (!feedback || feedback.length > 2000) return res.status(400).json({error:'Enter feedback of 1–2,000 characters.'});
    } else if (!title || title.length > 160 || description.length > 2000
      || ![input.department_id,input.category_id,input.project_id,input.assignee_id].every(uuid)
      || !['High','Medium','Low'].includes(input.priority)) {
      return res.status(400).json({error:'Enter a title and choose the department, category, project, assignee and priority.'});
    } else if (![input.entered_date,input.due_date,input.reminder_date].every(date)) {
      return res.status(400).json({error:'Enter valid calendar dates for the entered, due and reminder dates.'});
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let before;
      if (!creating) {
        await client.query('SELECT id FROM tickets WHERE id=$1 AND organization_id=$2 FOR UPDATE', [id, account.organization_id]);
        before = (await client.query(`${selection} WHERE ${visible} AND t.id=$4`, [...scope(account),id])).rows[0];
        if (!before) {
          await client.query('ROLLBACK');
          return res.status(404).json({error:'Ticket not found.'});
        }
        if (['update','status'].includes(action) && input.revision !== before.revision) {
          await client.query('ROLLBACK');
          return res.status(409).json({error:'The ticket details changed. Reopen the ticket and try again.'});
        }
      }

      if (action === 'status') {
        if (input.completed !== Boolean(before.completed_at)) {
          await client.query(`UPDATE tickets SET completed_at=CASE WHEN $2::boolean THEN clock_timestamp() ELSE NULL END,
            updated_at=clock_timestamp(), revision=revision+1 WHERE id=$1`, [id,input.completed]);
          await record(client,id,account,'update',input.completed ? 'Completed ticket' : 'Reopened ticket');
        }
      } else if (action === 'feedback') {
        await record(client,id,account,'feedback',feedback);
        await client.query('UPDATE tickets SET updated_at=clock_timestamp() WHERE id=$1',[id]);
      } else {
        const values = {...input,title,description};
        const details = fields.map(([key]) => values[key]);
        if (creating) {
          const placeholders = details.map((_, i) => `$${i + 4}`).join(', ');
          await client.query(`INSERT INTO tickets(id, organization_id, creator_id, ${columns}) VALUES($1,$2,$3,${placeholders})`,
            [id,account.organization_id,account.id,...details]);
        } else {
          const assignments = fields.map(([key], i) => `${key}=$${i + 2}`).join(', ');
          await client.query(`UPDATE tickets SET ${assignments} WHERE id=$1`, [id,...details]);
        }
        const after = (await client.query(`${selection} WHERE t.id=$1`, [id])).rows[0];
        const changes = fields.filter(([key]) => creating || before[key] !== after[key]).map(([key,label]) => {
          const value = row => (row[`${key}_label`] ?? row[key]) || '(empty)';
          return creating ? `${label}: ${value(after)}` : `${label}: ${value(before)} → ${value(after)}`;
        });
        if (changes.length) {
          await record(client,id,account,'update', [creating ? 'Created ticket' : 'Updated ticket', ...changes].join('\n'));
          if (!creating) {
            await client.query('UPDATE tickets SET updated_at=clock_timestamp(), revision=revision+1 WHERE id=$1',[id]);
          }
        }
      }
      await client.query('COMMIT');
      res.status(creating ? 201 : 200).json({id});
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23503') return res.status(400).json({error:'Choose a department, category, project and assignee from your organization.'});
      throw error;
    } finally {
      client.release();
    }
  }

  app.post(base, (req,res) => save(req,res,'create'));
  app.post(`${base}/:id/update`, (req,res) => save(req,res,'update'));
  app.post(`${base}/:id/feedback`, (req,res) => save(req,res,'feedback'));
  app.post(`${base}/:id/status`, (req,res) => save(req,res,'status'));
}

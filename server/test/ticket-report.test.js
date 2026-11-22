import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesTicketView} from '../../client/src/ticket-report.mjs';

test('ticket report handles due-date boundaries and completed tickets', () => {
  const views = ['all','pending','completed','overdue','today','upcoming'];
  const matching = (due_date, completed_at = null) => views.filter(view =>
    matchesTicketView({due_date,completed_at},view,'2026-12-28','2027-01-04'));
  assert.deepEqual(matching('2026-12-27'), ['all','pending','overdue']);
  assert.deepEqual(matching('2026-12-28'), ['all','pending','today']);
  assert.deepEqual(matching('2026-12-29'), ['all','pending','upcoming']);
  assert.deepEqual(matching('2027-01-04'), ['all','pending','upcoming']);
  assert.deepEqual(matching('2027-01-05'), ['all','pending']);
  for (const due of ['2026-12-27','2026-12-28','2027-01-04']) {
    assert.deepEqual(matching(due,'2026-12-28T12:00:00Z'), ['all','completed']);
  }
});

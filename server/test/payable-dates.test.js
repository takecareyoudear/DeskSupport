import test from 'node:test';
import assert from 'node:assert/strict';
import {nextDueDate} from '../../client/src/payable-dates.mjs';
test('payable schedules preserve first due date and calculate weekly, monthly and yearly occurrences',()=>{
 assert.equal(nextDueDate('weekly','2026-11-20','2026-11-15'),'2026-11-20');
 assert.equal(nextDueDate('weekly','2026-11-01','2026-11-15'),'2026-11-15');
 assert.equal(nextDueDate('weekly','2026-11-01','2026-11-16'),'2026-11-22');
 assert.equal(nextDueDate('weekly','2026-12-28','2027-01-01'),'2027-01-04');
 assert.equal(nextDueDate('monthly','2026-01-31','2026-02-01'),'2026-02-28');
 assert.equal(nextDueDate('monthly','2026-01-31','2026-03-01'),'2026-03-31');
 assert.equal(nextDueDate('yearly','2024-02-29','2027-01-01'),'2027-02-28');
 assert.equal(nextDueDate('yearly','2024-02-29','2028-01-01'),'2028-02-29');
 assert.equal(nextDueDate('monthly','2027-01-10','2026-11-15'),'2027-01-10');
});

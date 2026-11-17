import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendar, countIn, pickCurrent, progress, todayLocal } from '../assets/dates.js';

const c = { start_date: '2026-11-20', end_date: '2026-12-31', bonus_date: '2027-01-01', goal: 24, weekly_target: 4 };

test('6 Fri-Thu rows from Nov 20 to Dec 31, plus a Jan 1 bonus cell', () => {
  const cal = buildCalendar(c, new Set(), '2026-12-03');
  assert.deepEqual(cal.weekdays, ['Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu']);
  assert.equal(cal.weeks.length, 6);
  assert.equal(cal.weeks[0][0].label, 'Nov 20');
  assert.equal(cal.weeks[0][1].label, '21');
  assert.equal(cal.weeks[1][4].label, 'Dec 1');
  assert.equal(cal.weeks[5][6].date, '2026-12-31');
  assert.equal(cal.bonus.label, 'Jan 1');
  assert.equal(cal.bonus.future, true);
});

test('today and future flags come from the given local date', () => {
  const cal = buildCalendar(c, new Set(), '2026-12-03');
  const flat = cal.weeks.flat();
  const today = flat.find((d) => d.today);
  assert.equal(today.date, '2026-12-03');
  assert.equal(today.future, false);
  assert.equal(flat.find((d) => d.date === '2026-12-04').future, true);
  assert.equal(flat.find((d) => d.date === '2026-12-02').future, false);
});

test('this-week count uses the Fri-Thu week containing today', () => {
  const checked = new Set(['2026-11-26', '2026-11-27', '2026-11-28', '2026-12-03']);
  // Nov 27 (Fri) .. Dec 3 (Thu) is week 2
  assert.equal(buildCalendar(c, checked, '2026-12-01').weekCount, 3);
  assert.equal(buildCalendar(c, checked, '2026-11-26').weekCount, 1);
  // Before the start, show week 1 (Nov 26 is in it); after the end, the last week.
  assert.equal(buildCalendar(c, checked, '2026-11-17').weekCount, 1);
  assert.equal(buildCalendar(c, new Set(['2026-12-31']), '2027-01-05').weekCount, 1);
});

test('count includes the bonus day and ignores dates outside the challenge', () => {
  assert.equal(countIn(c, new Set(['2026-11-19', '2026-11-20', '2027-01-01', '2027-01-02'])), 2);
});

test('status text', () => {
  assert.equal(progress(8, 24).status, '16 to go');
  assert.equal(progress(24, 24).status, 'You did it!');
  assert.equal(progress(27, 24).status, '24 + 3 bonus');
  assert.equal(progress(27, 24).shown, 24);
  assert.equal(progress(17, 24).boardText, '17/24');
  assert.equal(progress(24, 24).boardText, '24 ✓');
  assert.equal(progress(28, 24).boardText, '24 +4');
});

test('pickCurrent: latest started, else next upcoming', () => {
  const list = [
    { slug: '02', start_date: '2026-09-01' },
    { slug: '03', start_date: '2026-11-20' },
    { slug: '04', start_date: '2027-02-01' },
  ];
  assert.equal(pickCurrent(list, '2026-12-01').slug, '03');
  assert.equal(pickCurrent(list, '2027-01-15').slug, '03');
  assert.equal(pickCurrent(list, '2027-02-01').slug, '04');
  assert.equal(pickCurrent([list[1]], '2026-11-17').slug, '03');
  assert.equal(pickCurrent([], '2026-11-17'), null);
});

test('todayLocal uses local calendar fields', () => {
  assert.equal(todayLocal(new Date(2026, 10, 20, 23, 59)), '2026-11-20');
  assert.equal(todayLocal(new Date(2026, 0, 1, 0, 0)), '2026-01-01');
});

// Calendar math on 'YYYY-MM-DD' strings. Arithmetic runs in UTC so DST never shifts a day;
// "today" comes from the viewer's local clock, because participants span time zones.

const DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n) => String(n).padStart(2, '0');

export function todayLocal(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function toUTC(s) {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(s, n) {
  return new Date(toUTC(s) + n * DAY).toISOString().slice(0, 10);
}

export function diffDays(from, to) {
  return Math.round((toUTC(to) - toUTC(from)) / DAY);
}

export function monthDay(s) {
  const d = new Date(toUTC(s));
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function weekday(s) {
  return WEEKDAYS[new Date(toUTC(s)).getUTCDay()];
}

/** Every date that counts toward the goal: start..end plus the bonus day. */
export function challengeDates(c) {
  const out = [];
  for (let s = c.start_date; s <= c.end_date; s = addDays(s, 1)) out.push(s);
  if (c.bonus_date) out.push(c.bonus_date);
  return out;
}

export function countIn(c, checked) {
  const valid = new Set(challengeDates(c));
  let n = 0;
  for (const d of checked) if (valid.has(d)) n++;
  return n;
}

/**
 * View model for the My check-ins screen.
 * Weeks are aligned to the start date (Nov 20 is a Friday, so rows run Fri to Thu).
 */
export function buildCalendar(c, checked, today) {
  const days = diffDays(c.start_date, c.end_date) + 1;
  const numWeeks = Math.ceil(days / 7);

  const cell = (date) => {
    const isChecked = checked.has(date);
    const isToday = date === today;
    const future = date > today;
    const label = date === c.start_date || date.endsWith('-01') ? monthDay(date) : String(Number(date.slice(8)));
    return { date, label, checked: isChecked, today: isToday, future, aria: monthDay(date) + (isToday ? ', today' : '') };
  };

  const weeks = [];
  for (let w = 0; w < numWeeks; w++) {
    const row = [];
    for (let j = 0; j < 7; j++) {
      const i = w * 7 + j;
      row.push(i < days ? cell(addDays(c.start_date, i)) : null);
    }
    weeks.push(row);
  }

  const weekdays = [];
  for (let j = 0; j < 7; j++) weekdays.push(weekday(addDays(c.start_date, j)));

  const ti = diffDays(c.start_date, today);
  const wk = Math.min(Math.max(Math.floor(ti / 7), 0), numWeeks - 1);
  let weekCount = 0;
  for (const d of weeks[wk]) if (d && checked.has(d.date)) weekCount++;

  const count = countIn(c, checked);
  return {
    weekdays,
    weeks,
    bonus: c.bonus_date ? { ...cell(c.bonus_date), label: monthDay(c.bonus_date) } : null,
    count,
    weekCount,
    ...progress(count, c.goal),
  };
}

export function progress(count, goal) {
  const achieved = count >= goal;
  const extra = Math.max(0, count - goal);
  return {
    achieved,
    shown: Math.min(count, goal),
    status: achieved ? (extra > 0 ? `${goal} + ${extra} bonus` : 'You did it!') : `${goal - count} to go`,
    boardText: achieved ? (extra > 0 ? `${goal} +${extra}` : `${goal} ✓`) : `${count}/${goal}`,
  };
}

/**
 * Pick the challenge /exercise should open: the latest one that has started, else the next to start.
 * Challenges marked `hidden` (e.g. a test run) are reachable by URL but never picked.
 */
export function pickCurrent(challenges, today) {
  const sorted = challenges.filter((c) => !c.hidden).sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  return sorted.find((c) => c.start_date <= today) || sorted[sorted.length - 1] || null;
}

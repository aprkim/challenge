import * as api from './api.js';
import { buildCalendar, countIn, monthDay, pickCurrent, progress, todayLocal } from './dates.js';

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');

const state = {
  view: 'loading', // loading | error | notfound | welcome | app
  errorMsg: '',
  category: '',
  challenge: null,
  key: '', // Firestore key, e.g. 'exercise-03'
  participants: [], // [{ id, name, dates: Set }], live from Firestore
  meId: null,
  picked: null, // participant id selected on Welcome
  joining: false,
  joinError: '',
};

// ---------- helpers ----------

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const storageKey = () => `challenge:${state.key}:participant`;

function readIdentity() {
  try { return localStorage.getItem(storageKey()); } catch { return null; }
}
function saveIdentity(id) {
  try { localStorage.setItem(storageKey(), id); } catch { /* private mode: identity lasts for this visit */ }
}
function clearIdentity() {
  try { localStorage.removeItem(storageKey()); } catch { /* ignore */ }
}

const me = () => state.participants.find((p) => p.id === state.meId) || null;
const myDates = () => me()?.dates || new Set();
const datesFor = (p) => p.dates;

let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3500);
}

const tab = () => (location.hash === '#everyone' ? 'everyone' : 'checkins');

const CHECK_SVG = (size, stroke, width) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>`;

// ---------- views ----------

function viewState() {
  if (state.view === 'loading') return `<div class="state"><div class="spinner" aria-label="Loading"></div></div>`;
  if (state.view === 'notfound') {
    return `<div class="state"><p>This challenge doesn't exist.</p><a href="/${esc(state.category || 'exercise')}">Go to the current challenge</a></div>`;
  }
  return `<div class="state"><p>${esc(state.errorMsg || "Couldn't load the challenge.")}</p><button class="btn-outline" data-action="retry">Try again</button></div>`;
}

function viewWelcome() {
  const c = state.challenge;
  const picked = state.participants.find((p) => p.id === state.picked);
  const names = state.participants
    .map((p) => `<button type="button" class="name-btn" data-action="pick" data-id="${p.id}" aria-pressed="${p.id === state.picked}" data-focus="pick-${p.id}">${esc(p.name)}</button>`)
    .join('');
  return `
  <main class="page welcome">
    <div class="intro">
      <div class="eyebrow">${esc(c.community_label)}</div>
      <h1>${esc(c.title)}</h1>
      <div class="meta">${monthDay(c.start_date)} to ${monthDay(c.end_date)} · ${c.weekly_target} times a week · Goal ${c.goal}</div>
    </div>
    ${state.participants.length ? `
    <div class="section">
      <div class="section-title">Who's checking in?</div>
      <div class="names">${names}</div>
    </div>` : ''}
    <form class="join" data-action="join" novalidate>
      <label for="newname">New here? Add your name</label>
      <div class="join-row">
        <input id="newname" name="name" type="text" placeholder="Your name" maxlength="20" autocomplete="off" autocapitalize="words" enterkeyhint="done" spellcheck="false">
        <button type="submit" class="btn-outline" ${state.joining ? 'disabled' : ''}>${state.joining ? 'Joining…' : 'Join'}</button>
      </div>
      ${state.joinError ? `<div class="field-error" role="alert">${esc(state.joinError)}</div>` : ''}
    </form>
    <div class="spacer"></div>
    <div class="cta-wrap">
      <button type="button" class="cta" data-action="continue" ${picked ? '' : 'disabled'} data-focus="continue">${picked ? `Continue as ${esc(picked.name)}` : 'Pick your name to start'}</button>
      <div class="footnote">Checking in is optional. It's just for the fun of it.</div>
    </div>
  </main>`;
}

function dayButton(cell, extraClass = '') {
  const cls = ['day', extraClass, cell.checked ? 'checked' : '', cell.today ? 'today' : '', cell.future ? 'future' : '']
    .filter(Boolean).join(' ');
  return `<button type="button" class="${cls}" data-action="toggle" data-date="${cell.date}" data-focus="d-${cell.date}"
    aria-label="${esc(cell.aria)}" aria-pressed="${cell.checked}" ${cell.future ? 'disabled' : ''}>
    <span class="num">${esc(cell.label)}</span>${cell.checked ? CHECK_SVG(15, '#FFFFFF', 3) : ''}</button>`;
}

function viewCheckins() {
  const c = state.challenge;
  const cal = buildCalendar(c, myDates(), todayLocal());
  const C = 2 * Math.PI * 40;
  const filled = (cal.shown / c.goal) * C;
  const weeks = cal.weeks
    .map((row) => `<div class="cal-row">${row.map((cell) => (cell ? dayButton(cell) : '<div></div>')).join('')}</div>`)
    .join('');
  return `
    <div class="progress-card ${cal.achieved ? 'done' : ''}">
      <div class="ring">
        <svg width="96" height="96" viewBox="0 0 96 96" role="img" aria-label="${cal.count} of ${c.goal} workouts">
          <circle cx="48" cy="48" r="40" fill="none" stroke="#E6E4E9" stroke-width="9"></circle>
          <circle class="bar" cx="48" cy="48" r="40" fill="none" stroke="${cal.achieved ? '#7E9A86' : '#6E6188'}" stroke-width="9"
            stroke-linecap="round" stroke-dasharray="${filled.toFixed(1)} ${C.toFixed(1)}" stroke-opacity="${cal.count ? 1 : 0}" transform="rotate(-90 48 48)"></circle>
        </svg>
        <div class="center"><div class="big">${cal.shown}</div><div class="of">of ${c.goal}</div></div>
      </div>
      <div class="progress-info">
        ${cal.achieved ? `<div class="pill">${CHECK_SVG(13, '#2F4636', 2.5)}Goal reached</div>` : ''}
        <div class="status">${esc(cal.status)}</div>
        <div class="week">This week ${cal.weekCount}/${c.weekly_target}</div>
      </div>
    </div>
    <div class="calendar">
      <div class="cal-row" aria-hidden="true">${cal.weekdays.map((d) => `<div class="wd">${d}</div>`).join('')}</div>
      ${weeks}
      ${cal.bonus ? `
      <div class="bonus-row">
        ${dayButton(cal.bonus)}
        <div class="bonus-note">Bonus day · catch up and start the new year</div>
      </div>` : ''}
    </div>`;
}

function viewEveryone() {
  const c = state.challenge;
  const people = state.participants.map((p, i) => ({ p, i, n: countIn(c, datesFor(p)) }));
  people.sort((a, b) => b.n - a.n || a.i - b.i);
  let total = 0;
  let done = 0;
  let rank = 0;
  const rows = people.map((x, idx) => {
    total += x.n;
    if (idx === 0 || x.n !== people[idx - 1].n) rank = idx + 1; // ties share a rank
    const pr = progress(x.n, c.goal);
    if (pr.achieved) done++;
    const isMe = x.p.id === state.meId;
    const pct = (pr.shown / c.goal) * 100;
    return `
      <div class="row ${isMe ? 'me' : ''}">
        <div class="row-top">
          <div class="rank">${rank}</div>
          <div class="row-name"><div class="n">${esc(x.p.name)}</div>${isMe ? '<div class="badge">Me</div>' : ''}</div>
          <div class="count ${pr.achieved ? 'done' : ''}">${esc(pr.boardText)}</div>
        </div>
        <div class="track"><div class="fill ${pr.achieved ? 'done' : ''}" style="width:${pct.toFixed(1)}%"></div></div>
      </div>`;
  });
  return `
    <div class="summary">
      <div class="label">Together we've done</div>
      <div class="total">${plural(total, 'workout', 'workouts')}</div>
      <div class="sub">${plural(people.length, 'person', 'people')} · ${done} reached the goal</div>
    </div>
    <div class="rows">${rows.join('') || '<div class="empty">No one has joined yet.</div>'}</div>`;
}

function viewApp() {
  const c = state.challenge;
  const t = tab();
  const p = me();
  const header = t === 'checkins'
    ? `<div class="head">
        <div class="titles"><div class="eyebrow">${esc(c.community_label)}</div><h1>${esc(c.title)}</h1></div>
        <button type="button" class="who" data-action="logout"><span class="who-name">${esc(p.name)}</span><span class="who-sub">Not you?</span></button>
      </div>`
    : `<div class="head"><div class="titles"><div class="eyebrow">${esc(c.community_label)}</div><h1>Everyone</h1></div></div>`;
  return `
  <main class="page tab">
    ${header}
    ${t === 'checkins' ? viewCheckins() : viewEveryone()}
  </main>
  <nav class="nav" aria-label="Sections"><div class="nav-inner">
    <a class="nav-item" href="#checkins" ${t === 'checkins' ? 'aria-current="page"' : ''}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3"></rect><path d="M16 2v4M8 2v4M3 10h18M9 15l2 2 4-4"></path></svg>
      My check-ins
    </a>
    <a class="nav-item" href="#everyone" ${t === 'everyone' ? 'aria-current="page"' : ''}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20c.8-3.4 3.4-5.5 6.5-5.5s5.7 2.1 6.5 5.5"></path><circle cx="17" cy="9" r="2.5"></circle><path d="M17 14.5c2.3.2 4 1.8 4.5 4.5"></path></svg>
      Everyone
    </a>
  </div></nav>`;
}

function render() {
  const focusKey = document.activeElement?.dataset?.focus;
  const draft = document.getElementById('newname')?.value;
  if (state.view === 'welcome') app.innerHTML = viewWelcome();
  else if (state.view === 'app') app.innerHTML = viewApp();
  else app.innerHTML = viewState();
  const input = document.getElementById('newname');
  if (input && draft) input.value = draft;
  if (focusKey) app.querySelector(`[data-focus="${focusKey}"]`)?.focus({ preventScroll: true });
}

// ---------- actions ----------

function showWelcome() {
  state.view = 'welcome';
  state.picked = null;
  state.joinError = '';
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  render();
  window.scrollTo(0, 0);
}

function enterApp(id) {
  state.meId = id;
  saveIdentity(id);
  state.view = 'app';
  if (location.hash && location.hash !== '#checkins') history.replaceState(null, '', location.pathname);
  render();
  window.scrollTo(0, 0);
}

async function join(form) {
  const input = form.elements.name;
  const name = input.value.replace(/\s+/g, ' ').trim();
  if (!name) { input.focus(); return; }
  if (api.invalidName(name)) {
    state.joinError = "That name can't be used. Try another.";
    render();
    return;
  }
  const existing = state.participants.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    state.picked = existing.id;
    input.value = '';
    state.joinError = '';
    render();
    return;
  }
  state.joining = true;
  state.joinError = '';
  render();
  try {
    const p = await api.join(state.key, name); // returns the existing person if the name was just taken
    state.picked = p.id;
    document.getElementById('newname').value = '';
  } catch {
    state.joinError = "Couldn't add your name. Check your connection and try again.";
  } finally {
    state.joining = false;
    render();
  }
}

/**
 * Optimistic by way of Firestore: the local write shows in the live snapshot right away,
 * and if the server rejects it the SDK reverts it and the promise rejects.
 */
function toggle(date) {
  const want = !myDates().has(date);
  api.setCheckin(state.key, state.meId, date, want).catch(() => {
    toast("Couldn't save. Check your connection and try again.");
  });
}

function onParticipants(list) {
  state.participants = list;
  if (state.view === 'loading') {
    const saved = readIdentity();
    if (saved && list.some((p) => p.id === saved)) {
      state.meId = saved;
      state.view = 'app';
    } else {
      if (saved) clearIdentity();
      showWelcome();
      return;
    }
  }
  render();
}

// ---------- boot ----------

function parsePath() {
  const m = location.pathname.match(/^\/([A-Za-z0-9_-]+)(?:\/([A-Za-z0-9_-]+))?\/?$/);
  return m ? { category: m[1].toLowerCase(), slug: m[2] || '' } : { category: 'exercise', slug: '' };
}

let unsubscribe = null;

async function boot() {
  state.view = 'loading';
  render();
  unsubscribe?.();
  const { category, slug } = parsePath();
  state.category = category;
  try {
    const all = (await api.listChallenges()).filter((c) => c.category === category);
    if (!slug) {
      const current = pickCurrent(all, todayLocal());
      if (!current) { state.view = 'notfound'; render(); return; }
      location.replace(`/${category}/${current.slug}`);
      return;
    }
    // Numbers are canonical without leading zeros: /exercise/03 and /exercise/003 → /exercise/3
    if (/^0+\d+$/.test(slug)) {
      location.replace(`/${category}/${Number(slug)}${location.hash}`);
      return;
    }
    const challenge = all.find((c) => c.slug === slug);
    if (!challenge) { state.view = 'notfound'; render(); return; }
    state.challenge = challenge;
    state.key = api.challengeKey(challenge);
    document.title = challenge.title;
    unsubscribe = await api.subscribe(state.key, onParticipants, () => {
      state.view = 'error';
      state.errorMsg = "Couldn't load the challenge. Check your connection.";
      render();
    });
  } catch {
    state.view = 'error';
    state.errorMsg = "Couldn't load the challenge. Check your connection.";
    render();
  }
}

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const action = el.dataset.action;
  if (action === 'pick') { state.picked = el.dataset.id; state.joinError = ''; render(); }
  else if (action === 'continue' && state.picked) enterApp(state.picked);
  else if (action === 'toggle') toggle(el.dataset.date);
  else if (action === 'logout') { clearIdentity(); state.meId = null; showWelcome(); }
  else if (action === 'retry') boot();
});

app.addEventListener('submit', (e) => {
  if (e.target.dataset.action !== 'join') return;
  e.preventDefault();
  if (!state.joining) join(e.target);
});

window.addEventListener('hashchange', () => {
  if (state.view !== 'app') return;
  render();
  window.scrollTo(0, 0);
});

// Data is live; re-render on return so "today" moves forward after midnight.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.view === 'app') render();
});

boot();

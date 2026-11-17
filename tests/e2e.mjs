// End-to-end check on two emulated phones (iPhone Safari/WebKit-sized and Android Chrome-sized)
// against the in-memory mock API. Run: node tests/e2e.mjs [screenshotDir]
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { createMockApi } from './mock-api.mjs';
import { todayLocal, addDays } from '../assets/dates.js';

// Uses the machine's Playwright (global install, resolved through NODE_PATH).
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const shots = process.argv[2];
const today = todayLocal();
let fail = false;

const challenges = [
  { id: 'c03', category: 'exercise', slug: '03', community_label: '오늘도 했다', title: '연말 6주 챌린지',
    start_date: '2026-11-20', end_date: '2026-12-31', bonus_date: '2027-01-01', goal: 24, weekly_target: 4 },
  // A challenge that is already running "today", so days can be checked.
  { id: 'ct', category: 'test', slug: 't1', community_label: '오늘도 했다', title: '테스트 챌린지',
    start_date: addDays(today, -25), end_date: addDays(today, 16), bonus_date: addDays(today, 17), goal: 24, weekly_target: 4 },
];
const api = createMockApi({ challenges, failCheckins: () => fail });
const apiServer = createServer((req, res) => api(req, res, new URL(req.url, 'http://x'))).listen(3102);
const web = spawn('node', ['scripts/dev-server.mjs'], { env: { ...process.env, PORT: '8102', POSTGREST_URL: 'http://localhost:3102' }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const BASE = 'http://localhost:8102';

const browser = await chromium.launch();
const iphone = await browser.newContext({ ...devices['iPhone 13'] });
const android = await browser.newContext({ ...devices['Pixel 5'] });
const shot = async (page, name) => shots && page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
const step = (msg) => console.log('✓', msg);

try {
  // --- /exercise redirects to the current challenge; Welcome copy ---
  const a = await iphone.newPage();
  await a.goto(BASE + '/');
  await a.waitForURL('**/exercise/03');
  await a.getByText('연말 6주 챌린지').waitFor();
  assert.equal(await a.locator('.meta').textContent(), 'Nov 20 to Dec 31 · 4 times a week · Goal 24');
  assert.equal(await a.locator('.cta').textContent(), 'Pick your name to start');
  assert.ok(await a.locator('.cta').isDisabled());
  assert.equal(await a.locator('.names').count(), 0);
  step('/ → /exercise → /exercise/03, Welcome copy, CTA disabled');

  await a.fill('#newname', 'April');
  await a.press('#newname', 'Enter');
  await a.getByRole('button', { name: 'Continue as April' }).waitFor();
  await shot(a, '1-welcome');
  await a.getByRole('button', { name: 'Continue as April' }).click();
  await a.locator('.progress-card').waitFor();
  assert.equal(await a.locator('.cal-row').count(), 7); // weekday header + 6 weeks
  assert.equal(await a.locator('.day:not([disabled])').count(), 0); // all future before Nov 20
  assert.equal(await a.locator('.wd').allTextContents().then((x) => x.join(' ')), 'Fri Sat Sun Mon Tue Wed Thu');
  assert.equal(await a.locator('.bonus-row .num').textContent(), 'Jan 1');
  await shot(a, '2-main-before-start');
  step('join via Enter, Continue, calendar Fri–Thu × 6 + Jan 1, all future days disabled');

  // --- running challenge: check, uncheck, persist ---
  await a.goto(BASE + '/test/t1');
  await a.fill('#newname', 'April');
  await a.click('text=Join');
  await a.click('text=Continue as April');
  const day = (d) => a.locator(`[data-date="${d}"]`);
  assert.match(await day(today).getAttribute('class'), /today/);
  assert.ok(await day(addDays(today, 1)).isDisabled());
  assert.match(await day(addDays(today, 1)).getAttribute('class'), /future/);
  for (const d of [today, addDays(today, -1), addDays(today, -7)]) await day(d).click();
  await day(addDays(today, -7)).click(); // tap again removes
  await a.waitForTimeout(300);
  assert.equal(await a.locator('.ring .big').textContent(), '2');
  assert.equal(await a.locator('.status').textContent(), '22 to go');
  await a.reload();
  await a.locator('.progress-card').waitFor();
  assert.equal(await a.locator('.ring .big').textContent(), '2');
  assert.equal(await day(today).getAttribute('aria-pressed'), 'true');
  assert.equal(await day(addDays(today, -7)).getAttribute('aria-pressed'), 'false');
  step('toggle on/off, today outlined, future disabled, persists after reload (skips Welcome)');

  // --- second device ---
  const b = await android.newPage();
  await b.goto(BASE + '/test/t1');
  await b.getByRole('button', { name: 'April', exact: true }).waitFor();
  await b.fill('#newname', '민지');
  await b.click('text=Join');
  await b.click('text=Continue as 민지');
  await b.locator(`[data-date="${addDays(today, -2)}"]`).click();
  await b.waitForTimeout(300);
  await b.click('text=Everyone');
  await b.locator('.summary').waitFor();
  assert.equal(await b.locator('.summary .total').textContent(), '3 workouts');
  assert.equal(await b.locator('.summary .sub').textContent(), '2 people · 0 reached the goal');
  const rowsB = await b.locator('.row').allInnerTexts();
  assert.match(rowsB[0], /1\s+April\s+2\/24/);
  assert.match(rowsB[1], /2\s+민지\s+Me\s+1\/24/);
  await shot(b, '3-everyone-android');
  step('second device sees April, joins, Everyone shows shared totals and Me badge');

  await a.click('text=Everyone');
  await a.waitForTimeout(300);
  assert.equal(await a.locator('.summary .total').textContent(), '3 workouts');
  step('first device Everyone matches');

  // --- rollback on error ---
  await a.click('text=My check-ins');
  fail = true;
  await day(addDays(today, -3)).click();
  assert.equal(await day(addDays(today, -3)).getAttribute('aria-pressed'), 'true'); // optimistic
  await a.locator('#toast:not([hidden])').waitFor();
  await a.waitForTimeout(100);
  assert.equal(await day(addDays(today, -3)).getAttribute('aria-pressed'), 'false');
  assert.equal(await a.locator('.ring .big').textContent(), '2');
  fail = false;
  step('optimistic check rolls back with a toast when the save fails');

  // --- goal reached + bonus ---
  for (let i = 0; i < 25; i++) {
    const d = addDays(today, -i);
    if ((await day(d).getAttribute('aria-pressed')) === 'false') await day(d).click();
  }
  await a.waitForTimeout(500);
  assert.equal(await a.locator('.ring .big').textContent(), '24');
  assert.equal(await a.locator('.status').textContent(), '24 + 1 bonus');
  await a.getByText('Goal reached').waitFor();
  await shot(a, '4-main-goal-reached');
  await a.click('text=Everyone');
  await a.waitForTimeout(300);
  assert.match((await a.locator('.row').allInnerTexts())[0], /April\s+Me\s+24 \+1/);
  assert.equal(await a.locator('.summary .sub').textContent(), '2 people · 1 reached the goal');
  await shot(a, '5-everyone-iphone');
  step('25 check-ins → "24 + 1 bonus", Goal reached pill, board "24 +1"');

  // --- Not you? ---
  await a.click('text=My check-ins');
  await a.click('text=Not you?');
  await a.getByText('Pick your name to start').waitFor();
  await a.reload();
  await a.getByText("Who's checking in?").waitFor();
  step('"Not you?" clears identity and returns to Welcome');

  // --- layout sanity: no horizontal scroll, tap targets ---
  for (const p of [a, b]) {
    await p.goto(BASE + '/test/t1');
    const w = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert.ok(w[0] <= w[1], `horizontal scroll ${w}`);
  }
  await b.click('text=My check-ins');
  const small = await b.evaluate(() =>
    [...document.querySelectorAll('button, a')].map((el) => el.getBoundingClientRect()).filter((r) => r.height && r.height < 44).length);
  assert.equal(small, 0);
  step('no horizontal scroll; every button/link ≥ 44px tall');

  console.log('\nAll e2e checks passed');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  web.kill();
  apiServer.close();
}

// End-to-end check on two emulated phones (iPhone- and Android-sized) against the
// Firebase emulators, using the real Firebase SDK and firestore.rules.
// Run: npm run e2e   (or: node tests/e2e.mjs [screenshotDir] inside `firebase emulators:exec`)
import { spawn } from 'node:child_process';
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { todayLocal, addDays } from '../assets/dates.js';

// Uses the machine's Playwright (global install, resolved through NODE_PATH).
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const shots = process.argv[2];
const today = todayLocal();

const web = spawn('node', ['scripts/dev-server.mjs'], { env: { ...process.env, PORT: '8102', EMULATOR: '1' }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const BASE = 'http://localhost:8102';

// Write straight to the Firestore emulator, bypassing rules (test setup only).
async function adminSetDates(key, pid, dates) {
  const url = `http://localhost:8085/v1/projects/demo-challenge/databases/(default)/documents/challenges/${key}/participants/${encodeURIComponent(pid)}?updateMask.fieldPaths=dates`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { dates: { arrayValue: { values: dates.map((d) => ({ stringValue: d })) } } } }),
  });
  assert.ok(res.ok, `emulator write failed: ${res.status}`);
}

const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
const browser = await chromium.launch({ proxy });
const iphone = await browser.newContext({ ...devices['iPhone 13'] });
const android = await browser.newContext({ ...devices['Pixel 5'] });

// If gstatic.com is unreachable (sandboxed CI), serve the identical CDN builds that ship
// in the firebase@10.12.5 npm package: set FIREBASE_SDK_DIR to node_modules/firebase.
if (process.env.FIREBASE_SDK_DIR) {
  const { readFile } = await import('node:fs/promises');
  for (const ctx of [iphone, android]) {
    await ctx.route('https://www.gstatic.com/firebasejs/10.12.5/*', async (route) => {
      const file = new URL(route.request().url()).pathname.split('/').pop();
      route.fulfill({ contentType: 'text/javascript', body: await readFile(`${process.env.FIREBASE_SDK_DIR}/${file}`) });
    });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  }
}
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
  await b.click('text=My check-ins');
  await b.locator(`[data-date="${addDays(today, -5)}"]`).click();
  await a.waitForFunction(() => document.querySelector('.summary .total')?.textContent === '4 workouts', null, { timeout: 5000 });
  step('first device Everyone matches, and updates live when the other phone checks in');

  // --- goal reached + bonus ---
  await a.click('text=My check-ins');
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
  assert.equal(await a.locator('.summary .total').textContent(), '27 workouts');
  await shot(a, '5-everyone-iphone');
  step('25 check-ins → "24 + 1 bonus", Goal reached pill, board "24 +1"');

  // --- rollback when the server rejects a write (rules cap a list at 100 dates) ---
  await b.click('text=My check-ins');
  const bday = (d) => b.locator(`[data-date="${d}"]`);
  const filler = Array.from({ length: 100 }, (_, i) => addDays('2020-01-01', i));
  await adminSetDates('test-t1', '민지', filler);
  await bday(addDays(today, -4)).waitFor();
  await b.waitForTimeout(300);
  await bday(addDays(today, -4)).click();
  await b.locator('#toast:not([hidden])').waitFor();
  await b.waitForTimeout(200);
  assert.equal(await bday(addDays(today, -4)).getAttribute('aria-pressed'), 'false');
  assert.equal(await b.locator('.ring .big').textContent(), '0'); // out-of-range dates never count
  step('server-rejected check-in rolls back with a toast; junk dates are not counted');

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
}

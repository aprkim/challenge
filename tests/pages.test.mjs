import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// GitHub Pages serves 404.html for /exercise and /exercise/3, so it must be the app shell.
test('404.html is identical to index.html', () => {
  assert.equal(readFileSync(new URL('../404.html', import.meta.url), 'utf8'), readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
});

test('challenges.json entries are complete', () => {
  const list = JSON.parse(readFileSync(new URL('../challenges.json', import.meta.url), 'utf8'));
  const keys = ['category', 'slug', 'community_label', 'title', 'start_date', 'end_date', 'goal', 'weekly_target'];
  for (const c of list) {
    for (const k of keys) assert.ok(c[k] !== undefined && c[k] !== '', `${c.slug}: missing ${k}`);
    assert.match(`${c.category}-${c.slug}`, /^[a-z0-9]+-[a-z0-9]+$/);
    assert.ok(c.end_date >= c.start_date);
    assert.ok(!/^0\d/.test(c.slug), `${c.slug}: numeric slugs have no leading zeros (the app redirects 03 → 3)`);
  }
});

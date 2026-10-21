import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// index.js has no imports on purpose: a profile-installed bundle cannot resolve
// the Host's @deepseek-ai/* packages. Copy it somewhere importable and load it.
const dir = mkdtempSync(join(tmpdir(), 'ui-zoom-host-'));
const copy = join(dir, 'index.js');
writeFileSync(copy, readFileSync(new URL('../index.js', import.meta.url), 'utf8'));
const mod = await import(`file://${copy.replaceAll('\\', '/')}`);

assert.equal(typeof mod.apply, 'function', 'apply exported');
assert.equal(mod.Config, undefined, 'no Config: the row config is read as a plain object');
assert.equal(mod.ZOOM_DEFAULT, 100);
assert.equal(mod.ZOOM_MIN, 50);
assert.equal(mod.ZOOM_MAX, 400);

function run(config) {
  const rows = [];
  let listener;
  const ctx = { on(event, handler) { assert.equal(event, 'webserver/index-inject'); listener = handler; } };
  mod.apply(ctx, config);
  if (listener !== undefined) listener(rows);
  return rows;
}

const rows = run({ zoom: 125 });
assert.equal(rows.length, 1, 'one pre-paint row even when a default is set');
assert.equal(rows[0].kind, 'script');
assert.equal(rows[0].placement, 'body');
assert.ok(rows[0].text.includes('var percent = 125'), 'script seeds the profile default');
assert.ok(rows[0].text.includes("localStorage.getItem('dsh-ui-zoom')"), 'script prefers the stored per-browser choice');
assert.ok(rows[0].text.includes('(percent / 100)'), 'script converts the percentage to a CSS factor');
assert.ok(rows[0].text.includes("style.textContent = '#root{zoom:'"), 'boot stylesheet targets the app root');
assert.ok(rows[0].text.includes('data-dsh-ui-zoom-boot'), 'boot stylesheet is removable by the client');
assert.ok(!rows[0].text.includes('document.body.style.zoom'), 'boot never zooms body (portal coordinates would double-scale)');
assert.ok(!rows[0].text.includes("document.getElementById('root') || document.body"), 'no body fallback before #root parses');

assert.equal(run({ zoom: 100 }).length, 1, 'the default still injects the stored-value reader');
assert.ok(run({ zoom: 100 })[0].text.includes('var percent = 100'), 'default percentage seeded');
assert.ok(run({}).length === 1 && run({})[0].text.includes('var percent = 100'), 'missing config falls back to 100');
assert.ok(run(undefined)[0].text.includes('var percent = 100'), 'absent config falls back to 100');
assert.ok(run({ zoom: 9999 })[0].text.includes('var percent = 400'), 'clamped to 400');
assert.ok(run({ zoom: 10 })[0].text.includes('var percent = 50'), 'clamped to 50');
assert.ok(run({ zoom: 'nonsense' })[0].text.includes('var percent = 100'), 'unusable values fall back to 100');

console.log('index.js harness: all assertions passed');

// Start GTM_VIEWER_FIXTURE_COLUMNS=1 node tests/serve.mjs <runtime> first.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
const output = resolve(process.argv[2]);
mkdirSync(output, { recursive: true });
const command = (...args) => {
  const result = spawnSync('agent-browser', ['--session', 'gtm-column-acceptance', ...args], { encoding: 'utf8', timeout: 40000 });
  if (result.status !== 0) throw Error(result.stderr || result.stdout);
  return result.stdout.trim();
};
const evaluate = code => JSON.parse(command('eval', code));
const wait = code => command('wait', '--fn', code);
const viewport = (width, height) => {
  command('set', 'viewport', String(width), String(height));
  wait(`innerWidth === ${width} && innerHeight === ${height}`);
  command("eval", "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
};
const url = 'http://127.0.0.1:3942/viewer?workflow=stable&view=data&table=companies';
const open = () => {
  command('click', '.columns-trigger');
  wait('document.querySelector(".columns-popover").matches(":popover-open")');
};
const bounds = () => {
  const result = evaluate('(()=>{const p=document.querySelector(".columns-popover").getBoundingClientRect(); return {left:p.left,right:p.right,top:p.top,bottom:p.bottom,width:innerWidth,height:innerHeight}})()');
  assert.ok(result.left >= 0 && result.right <= result.width && result.top >= 0 && result.bottom <= result.height, JSON.stringify(result));
};
command('open', url);
viewport(1440, 900);
command('set', 'media', 'dark');
command('record', 'start', join(output, 'column-selector.webm'), url);
try {
  viewport(1440, 900);
  command('wait', '--text', 'Acme Labs');
  open(); bounds();
  command('fill', '[name=column-search]', 'domain');
  assert.equal(evaluate('document.querySelectorAll(".columns-option").length'), 2);
  command('check', 'input[value=email_domain]');
  command('click', '.columns-apply');
  wait('document.querySelector(".columns-trigger").textContent.includes("7")');
  assert.ok(evaluate('new URL(location.href).searchParams.get("columns").split(",").includes("email_domain")'));
  assert.ok(evaluate('[...document.querySelectorAll("thead th")].some(x=>x.textContent.includes("email domain"))'));
  open();
  command('fill', '[name=column-search]', 'no matching field');
  command('wait', '--text', 'No matching columns.');
  command('press', 'Escape');
  assert.equal(evaluate('document.activeElement.className'), 'columns-trigger');
  open();
  command('click', '.columns-reset');
  wait('document.querySelector(".columns-trigger").textContent.includes("6")');
  assert.equal(evaluate('new URL(location.href).searchParams.has("columns")'), false);
  open();
  command('fill', '[name=column-search]', 'domain');
  command('uncheck', 'input[type=checkbox][value=domain]');
  wait('document.querySelector(".columns-description").textContent.startsWith("5 of")');
  command('click', '.columns-apply');
  wait('document.querySelector(".columns-trigger").textContent.includes("5")');
  assert.equal(evaluate('[...document.querySelectorAll("thead th button")].some(x=>x.textContent === "domain")'), false);
  open();
  command('click', '.columns-reset');
  wait('document.querySelector(".columns-trigger").textContent.includes("6")');
  open();
  command('uncheck', 'input[type=checkbox][value=domain]');
  command('click', 'h1'); // Outside click dismisses without applying a draft.
  wait('!document.querySelector(".columns-popover").matches(":popover-open")');
  open();
  assert.equal(evaluate('document.querySelector("input[type=checkbox][value=domain]").checked'), true);
  command('press', 'Escape');
  command('press', 'Enter'); // Keyboard opens and focuses search.
  wait('document.activeElement.name === "column-search"');
  command('press', 'Escape');
  viewport(390, 844);
  open(); bounds();
  command('fill', '[name=column-search]', 'name');
  command('press', 'Escape');
  viewport(1440, 900);
  open();
} finally { command('record', 'stop'); }
viewport(1440, 900);
command('screenshot', join(output, 'columns-dark.png'));
command('set', 'media', 'light');
command('screenshot', join(output, 'columns-light.png'));
command('press', 'Escape');
viewport(390, 844);
open(); bounds();
command('screenshot', join(output, 'columns-mobile.png'));
command('close');
console.log('Columns: open, search, checkbox, Apply, actual table update, Reset, outside click, Escape, keyboard focus, dark/light and mobile passed.');

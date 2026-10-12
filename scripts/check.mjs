// FluentContext Pro — static quality gate (runs in CI before tests). No dependencies.
//   node scripts/check.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const fail = (msg) => problems.push(msg);
const rel = (p) => relative(root, p).split(sep).join('/');
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const read = (p) => readFileSync(join(root, p), 'utf8');

// 1. Syntax of every script.
const scripts = ['background.js', ...['src', 'popup', 'scripts', 'tests'].flatMap((d) => walk(join(root, d)).map(rel))].filter((f) => /\.(m?js)$/.test(f));
for (const f of scripts) {
  try { execFileSync(process.execPath, ['--check', join(root, f)], { stdio: 'pipe' }); } catch (e) { fail(`syntax: ${f}\n${e.stderr}`); }
}

// 2. Manifest references.
const manifest = JSON.parse(read('manifest.json'));
const refs = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.options_ui.page,
  ...Object.values(manifest.icons),
  ...Object.values(manifest.action.default_icon),
  ...manifest.content_scripts.flatMap((c) => c.js)
];
for (const r of refs) if (!existsSync(join(root, r))) fail(`manifest references missing file: ${r}`);
const imported = [...(/importScripts\(([^)]*)\)/.exec(read('background.js'))?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
for (const r of imported) if (!existsSync(join(root, r))) fail(`background imports missing file: ${r}`);

// 3. Versions stay in sync.
const pkg = JSON.parse(read('package.json'));
if (pkg.version !== manifest.version) fail(`version mismatch: package.json ${pkg.version} ≠ manifest.json ${manifest.version}`);
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) fail(`manifest version must be x.y.z (got ${manifest.version})`);
if (!read('CHANGELOG.md').includes(`## [${manifest.version}]`)) fail(`CHANGELOG.md has no "## [${manifest.version}]" section`);

// 4. Permissions are a reviewed contract: changing them needs docs/STORE.md justifications too.
const ALLOWED = ['alarms', 'clipboardWrite', 'downloads', 'storage'];
const perms = [...manifest.permissions].sort();
if (JSON.stringify(perms) !== JSON.stringify(ALLOWED)) fail(`permissions changed (${perms.join(', ')}). Update ALLOWED in scripts/check.mjs and the justifications in docs/STORE.md.`);
if (JSON.stringify(manifest.host_permissions) !== '["<all_urls>"]') fail('host_permissions changed; review docs/STORE.md');
const csp = (manifest.content_security_policy || {}).extension_pages || '';
if (!/script-src 'self'(;|$)/.test(csp) || /unsafe-eval|http:|https:/.test(csp.replace(/connect-src [^;]*/, ''))) fail(`extension CSP is too loose: ${csp}`);

// 5. Dangerous patterns in shipped code.
const shipped = ['background.js', ...walk(join(root, 'src')).map(rel), ...walk(join(root, 'popup')).map(rel)].filter((f) => f.endsWith('.js'));
const RULES = [
  [/\beval\s*\(/, 'eval()'],
  [/\bnew Function\s*\(/, 'new Function()'],
  [/\.(inner|outer)HTML\s*=/, 'innerHTML/outerHTML assignment (use FC.util.h / FC.svgNode)'],
  [/insertAdjacentHTML|document\.write\s*\(/, 'HTML string injection'],
  [/set(Timeout|Interval)\s*\(\s*['"`]/, 'string timer'],
  [/console\.log\s*\(/, 'console.log left in shipped code'],
  [/\bdebugger\b/, 'debugger statement']
];
for (const f of shipped) {
  read(f).split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    for (const [re, what] of RULES) if (re.test(code)) fail(`${f}:${i + 1}: ${what}`);
  });
}

// 6. Translations: every language has every key, with the same placeholders.
const ctx = vm.createContext({ navigator: { languages: ['en'] } });
ctx.self = ctx;
for (const f of ['src/i18n/i18n.js', 'src/i18n/menu.js', 'src/i18n/popup.js']) vm.runInContext(read(f), ctx, { filename: f });
const dicts = ctx.FC.i18n._dicts;
const vars = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join();
for (const [code, d] of Object.entries(dicts)) {
  for (const k of Object.keys(dicts.en)) {
    if (!(k in d)) fail(`i18n: ${code} is missing "${k}"`);
    else if (vars(d[k]) !== vars(dicts.en[k])) fail(`i18n: ${code}.${k} placeholders differ from English`);
  }
  for (const k of Object.keys(d)) if (!(k in dicts.en)) fail(`i18n: ${code} has unknown key "${k}"`);
}

// 7. Size budget for what every page loads.
const contentBytes = manifest.content_scripts.flatMap((c) => c.js).reduce((n, f) => n + statSync(join(root, f)).size, 0);
if (contentBytes > 300 * 1024) fail(`content scripts are ${(contentBytes / 1024).toFixed(0)} KB (budget 300 KB)`);

if (problems.length) {
  console.error(`✗ ${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`✓ check passed — ${scripts.length} scripts, ${refs.length} manifest refs, ${Object.keys(dicts).length} languages, content scripts ${(contentBytes / 1024).toFixed(0)} KB`);

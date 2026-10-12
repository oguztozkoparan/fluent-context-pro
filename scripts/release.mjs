// FluentContext Pro — versioning & release helpers. No dependencies.
//
//   node scripts/release.mjs bump <patch|minor|major|x.y.z> [--no-git]
//        Updates package.json + manifest.json, moves "Unreleased" notes in CHANGELOG.md under the
//        new version, then commits "chore(release): vX.Y.Z" and creates the annotated tag vX.Y.Z.
//        Push with:  git push --follow-tags   → the Release workflow builds and publishes it.
//   node scripts/release.mjs verify <tag>      CI: tag, package.json and manifest.json must agree.
//   node scripts/release.mjs notes <version>   Prints that version's CHANGELOG section.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [cmd, arg] = process.argv.slice(2);
const noGit = process.argv.includes('--no-git');
const readJson = (f) => JSON.parse(readFileSync(join(root, f), 'utf8'));
const writeJson = (f, v) => writeFileSync(join(root, f), JSON.stringify(v, null, 2) + '\n');
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const die = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

function section(changelog, version) {
  const start = changelog.indexOf(`## [${version}]`);
  if (start < 0) return null;
  const rest = changelog.slice(start).split('\n').slice(1);
  const end = rest.findIndex((l) => /^## \[/.test(l));
  return rest.slice(0, end < 0 ? undefined : end).join('\n').trim();
}

function bump(current, level) {
  if (/^\d+\.\d+\.\d+$/.test(level)) return level;
  const [a, b, c] = current.split('.').map(Number);
  if (level === 'major') return `${a + 1}.0.0`;
  if (level === 'minor') return `${a}.${b + 1}.0`;
  if (level === 'patch') return `${a}.${b}.${c + 1}`;
  return die(`unknown bump "${level}" (use patch, minor, major or x.y.z)`);
}

if (cmd === 'bump') {
  const pkg = readJson('package.json');
  const manifest = readJson('manifest.json');
  if (pkg.version !== manifest.version) die(`versions differ: ${pkg.version} vs ${manifest.version}`);
  const next = bump(pkg.version, arg || 'patch');
  const [x, y, z] = next.split('.').map(Number);
  const [p, q, r] = pkg.version.split('.').map(Number);
  if (x < p || (x === p && (y < q || (y === q && z <= r)))) die(`${next} is not newer than ${pkg.version}`);
  if (!noGit && git('status', '--porcelain')) die('working tree is not clean; commit or stash first');

  const changelogPath = join(root, 'CHANGELOG.md');
  let changelog = readFileSync(changelogPath, 'utf8');
  const date = new Date().toISOString().slice(0, 10);
  if (!changelog.includes('## [Unreleased]')) die('CHANGELOG.md needs an "## [Unreleased]" section');
  const unreleased = section(changelog, 'Unreleased');
  if (!unreleased) die('"Unreleased" in CHANGELOG.md is empty — describe the changes first');
  changelog = changelog.replace('## [Unreleased]', `## [Unreleased]\n\n## [${next}] - ${date}`);
  writeFileSync(changelogPath, changelog);
  pkg.version = next;
  manifest.version = next;
  writeJson('package.json', pkg);
  writeJson('manifest.json', manifest);
  console.log(`✓ ${pkg.name} ${next}`);
  if (!noGit) {
    git('add', 'package.json', 'manifest.json', 'CHANGELOG.md');
    git('commit', '-m', `chore(release): v${next}`);
    git('tag', '-a', `v${next}`, '-m', `v${next}`);
    console.log(`✓ committed and tagged v${next}\n  next: git push --follow-tags`);
  }
} else if (cmd === 'verify') {
  const tag = String(arg || '').replace(/^refs\/tags\//, '');
  const { version } = readJson('manifest.json');
  const pkg = readJson('package.json');
  if (tag !== `v${version}`) die(`tag ${tag} does not match manifest version ${version}`);
  if (pkg.version !== version) die(`package.json ${pkg.version} does not match manifest ${version}`);
  if (!section(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), version)) die(`CHANGELOG.md has no notes for ${version}`);
  console.log(`✓ ${tag} matches package.json, manifest.json and CHANGELOG.md`);
} else if (cmd === 'notes') {
  const notes = section(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), arg);
  if (!notes) die(`no CHANGELOG section for ${arg}`);
  process.stdout.write(`${notes}\n`);
} else {
  die('usage: release.mjs bump <patch|minor|major|x.y.z> | verify <tag> | notes <version>');
}

#!/usr/bin/env node
// Refresh the Umbrel App Store package for a SparkyFitness release.
//
// Rewrites umbrel/sparkyfitness/umbrel-app.yml (version, releaseNotes) and
// docker-compose.yml (image digests) so the store package tracks the release
// that Publish Docker Images just pushed. Runs with no dependencies so it works
// both on a GitHub runner and locally:
//
//   node umbrel/update-package.mjs                 # latest published release
//   node umbrel/update-package.mjs --version v1.7.2
//   node umbrel/update-package.mjs --no-postgres   # leave the database pin alone
//
// Exits 0 and writes nothing when the package is already up to date.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_DIR = join(dirname(fileURLToPath(import.meta.url)), 'sparkyfitness');
const MANIFEST = join(PKG_DIR, 'umbrel-app.yml');
const COMPOSE = join(PKG_DIR, 'docker-compose.yml');
const REPO = 'CodeWithCJ/SparkyFitness';

// Umbrel requires both of these on every runtime image; a package that pins an
// architecture-specific digest installs on x86 and fails on a Raspberry Pi.
const REQUIRED_PLATFORMS = ['linux/amd64', 'linux/arm64'];
const MAX_NOTE_BULLETS = 12;

const MANIFEST_ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
].join(',');

/** Parse CLI flags into `{version, postgres, help}`, rejecting a malformed tag early. */
function parseArgs(argv) {
  const args = { version: null, postgres: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--version') {
      args.version = argv[i + 1];
      i += 1;
    } else if (arg === '--no-postgres') {
      args.postgres = false;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (args.version && !/^v\d+\.\d+\.\d+/.test(args.version)) {
    throw new Error(`--version expects a release tag such as v1.7.2, got "${args.version}"`);
  }
  return args;
}

/** GET a path under this repo's GitHub API, authenticating when a token is present. */
async function githubJson(path) {
  const headers = { Accept: 'application/vnd.github+json' };
  // Anonymous works for a public repo, but Actions runners share an IP pool and
  // hit the unauthenticated rate limit quickly.
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub ${path} returned ${res.status} ${res.statusText}`);
  return res.json();
}

/** Resolve the release to package: an explicit tag, else the newest published one. */
async function getRelease(version) {
  if (version) return githubJson(`/releases/tags/${version}`);
  // Deliberately not /releases/latest: this must agree with the tag that
  // Publish Docker Images built, which picks the newest non-draft, non-prerelease.
  const releases = await githubJson('/releases?per_page=30');
  const release = releases.find((r) => !r.draft && !r.prerelease);
  if (!release) throw new Error('No published, non-prerelease release found');
  return release;
}

/**
 * Turn a GitHub release body into App Store copy.
 *
 * Release bodies here are ~7KB of sponsorship blocks, admonitions and
 * "* feat(scope): thing by @user in <pr url>" lines. None of that belongs in a
 * store listing, so keep any breaking-change callout, reduce the change list to
 * plain sentences, and link out for the rest.
 */
export function formatReleaseNotes(body, releaseUrl, version) {
  const lines = (body || '').replace(/\r\n/g, '\n').split('\n');

  const breaking = [];
  const changes = [];
  let section = null; // 'breaking' | 'changes' | null

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('<!--')) continue; // template placeholders
    if (line.startsWith('>')) continue; // [!IMPORTANT] upgrade/backup admonitions
    if (line === '---') continue;
    if (/^\*\*Full Changelog\*\*/i.test(line)) continue;

    if (line.startsWith('#')) {
      const heading = line.replace(/^#+\s*/, '');
      if (/breaking/i.test(heading)) section = 'breaking';
      else if (/support sparkyfitness|sponsor/i.test(heading)) section = null;
      else if (/what's changed|highlights|features|fixes|improvements|changes/i.test(heading))
        section = 'changes';
      else section = null;
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (!bullet) continue;
    const text = cleanBullet(bullet[1]);
    if (!text) continue;
    if (section === 'breaking') breaking.push(text);
    else if (section === 'changes' && !isNoise(text)) changes.push(text);
  }

  const out = [];
  if (breaking.length) {
    out.push('Breaking changes in this release:');
    out.push(...breaking.slice(0, 4).map((c) => `- ${c}`));
  }
  if (changes.length) {
    if (out.length) out.push('Also in this release:');
    out.push(...changes.slice(0, MAX_NOTE_BULLETS).map((c) => `- ${c}`));
  }
  if (!out.length) out.push(`SparkyFitness ${version}.`);
  out.push(`Full release notes: ${releaseUrl}`);
  return out;
}

// Housekeeping that lands in every release and means nothing to someone reading
// an App Store listing.
const NOISE = [
  /localeregistry/i,
  /^(mobile|frontend|backend)?\s*update translations/i,
  /^bump \S+ from /i,
  /^update (weblate|locales|translations)\b/i,
];

/** True when a bullet is routine housekeeping that does not belong in store copy. */
function isNoise(text) {
  return NOISE.some((re) => re.test(text));
}

/** Strip changelog noise from one bullet: PR attribution, links, and commit-type prefixes. */
function cleanBullet(text) {
  return text
    .replace(/\s+by\s+@[\w-]+\s+in\s+https?:\/\/\S+$/i, '') // "by @user in <pr url>"
    .replace(/\s+https?:\/\/\S+$/i, '')
    .replace(/^(?:feat|fix|chore|refactor|perf|docs|build|ci|style|test)(?:\([^)]*\))?!?:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Resolve a tag to its multi-arch manifest-list digest on Docker Hub.
 * Throws unless the tag is an index covering every REQUIRED_PLATFORMS entry, so
 * a single-arch or half-built release can never be pinned into the package.
 */
export async function resolveDigest(repo, tag) {
  const auth = await fetch(
    `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull`
  );
  if (!auth.ok) throw new Error(`Docker Hub auth for ${repo} returned ${auth.status}`);
  const { token } = await auth.json();

  const res = await fetch(`https://registry-1.docker.io/v2/${repo}/manifests/${tag}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: MANIFEST_ACCEPT },
  });
  if (!res.ok) throw new Error(`${repo}:${tag} not found on Docker Hub (${res.status})`);

  const digest = res.headers.get('docker-content-digest');
  if (!digest) throw new Error(`${repo}:${tag} returned no Docker-Content-Digest header`);

  const index = await res.json();
  if (!Array.isArray(index.manifests)) {
    throw new Error(
      `${repo}:${tag} is a single-image manifest, not a multi-arch index. ` +
        'Umbrel requires linux/amd64 and linux/arm64.'
    );
  }
  const platforms = index.manifests
    .filter((m) => m.platform && m.platform.architecture !== 'unknown')
    .map((m) => `${m.platform.os}/${m.platform.architecture}`);
  const missing = REQUIRED_PLATFORMS.filter((p) => !platforms.includes(p));
  if (missing.length) {
    throw new Error(`${repo}:${tag} is missing ${missing.join(' and ')} (has ${platforms.join(', ')})`);
  }
  return { digest, platforms };
}

/** Repin one `image:` line to a new tag and digest, erroring if that image is absent. */
function replaceImage(source, repo, tagAndDigest, file) {
  // The trailing ':' keeps "codewithcj/sparkyfitness:" from also matching
  // "codewithcj/sparkyfitness_server:".
  const pattern = new RegExp(`(image:\\s*${repo.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}:)\\S+`);
  if (!pattern.test(source)) throw new Error(`No pinned image for ${repo} in ${file}`);
  return source.replace(pattern, `$1${tagAndDigest}`);
}

/** Rewrite `version` and the `releaseNotes` block, returning the old and new manifest text. */
function updateManifest(version, noteLines) {
  const source = readFileSync(MANIFEST, 'utf8');
  let out = source.replace(/^version:.*$/m, `version: "${version}"`);
  if (out === source && !source.includes(`version: "${version}"`)) {
    throw new Error('No version: line found in umbrel-app.yml');
  }

  // Folded block scalar: single newlines fold into spaces, so a blank line
  // between entries is what makes Umbrel render them as separate lines.
  const body = noteLines.map((l) => `  ${l}`).join('\n\n');
  const next = `releaseNotes: >-\n${body}\n`;
  const existing = /^releaseNotes:.*(?:\n(?:[ \t]+.*)?$)*/m;
  if (!existing.test(out)) throw new Error('No releaseNotes: block found in umbrel-app.yml');
  out = out.replace(existing, next);
  return { source, out };
}

/** Resolve the release, repin every image, and write the package only when something changed. */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 13).join('\n'));
    return;
  }

  const release = await getRelease(args.version);
  const version = release.tag_name;
  console.log(`Release ${version} (${release.html_url})`);

  const pins = [
    { repo: 'codewithcj/sparkyfitness', tag: version },
    { repo: 'codewithcj/sparkyfitness_server', tag: version },
  ];
  if (args.postgres) {
    // Same tag, re-resolved: picks up Alpine rebuilds without changing the
    // PostgreSQL version, which would be a data-migration event.
    const compose = readFileSync(COMPOSE, 'utf8');
    const pg = compose.match(/image:\s*postgres:(\S+?)@/);
    if (!pg) throw new Error('No pinned postgres image found in docker-compose.yml');
    pins.push({ repo: 'library/postgres', tag: pg[1], composeRepo: 'postgres' });
  }

  for (const pin of pins) {
    const { digest, platforms } = await resolveDigest(pin.repo, pin.tag);
    pin.digest = digest;
    console.log(`  ${pin.repo}:${pin.tag} -> ${digest} [${platforms.join(', ')}]`);
  }

  const notes = formatReleaseNotes(release.body, release.html_url, version);
  const { source: manifestBefore, out: manifestAfter } = updateManifest(version, notes);

  const composeBefore = readFileSync(COMPOSE, 'utf8');
  let composeAfter = composeBefore;
  for (const pin of pins) {
    composeAfter = replaceImage(
      composeAfter,
      pin.composeRepo || pin.repo,
      `${pin.tag}@${pin.digest}`,
      'docker-compose.yml'
    );
  }

  const changed = manifestAfter !== manifestBefore || composeAfter !== composeBefore;
  if (!changed) {
    console.log('Package already up to date; nothing written.');
    return;
  }
  writeFileSync(MANIFEST, manifestAfter);
  writeFileSync(COMPOSE, composeAfter);
  console.log(`Updated umbrel/sparkyfitness for ${version}.`);
}

// Importable for tests without running the updater.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(`error: ${err.message}`);
    process.exit(1);
  });
}

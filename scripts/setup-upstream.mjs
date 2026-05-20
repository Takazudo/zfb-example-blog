#!/usr/bin/env node
/**
 * scripts/setup-upstream.mjs
 *
 * Bootstrap script for the single sibling upstream repo this consumer
 * depends on: zfb (zudo-front-builder). Run once on a fresh checkout
 * before `pnpm install`.
 *
 * Usage:
 *   pnpm setup:upstream
 *
 * What it does:
 *   1. Reads the zfb SHA pin from framework-pins.json.
 *   2. For the zfb sibling:
 *      - If missing: git clone + checkout to the pinned SHA.
 *      - If present and clean: git fetch + checkout to the pinned SHA.
 *      - If present and dirty: exit with an error pointing at
 *        dev-wip-package-upstream-wt-dev.
 *   3. Runs `pnpm install --frozen-lockfile` in the zfb sibling (required
 *      by zfb's build.rs to resolve framework packages, and by example
 *      bundling to resolve zfb-runtime's deps like `hono`).
 *   4. Installs the zfb CLI into a project-local .zfb-bin/ dir (no --force
 *      on the global ~/.cargo/bin/zfb; the user may be iterating zfb
 *      simultaneously).
 *   5. Runs `pnpm install` in this consumer repo.
 *   6. Runs `pnpm build` to verify the setup end-to-end.
 *
 * Sibling layout expected by this repo:
 *   $HOME/repos/zfb-ex/
 *     zfb/                       <- zfb sibling (pinned SHA)
 *     <this-repo>/               <- this consumer repo
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

function run(cmd, cwd = repoRoot) {
  console.log(`  > ${cmd}`);
  const result = spawnSync(cmd, { shell: true, stdio: 'inherit', cwd });
  if (result.status !== 0) {
    console.error(`Command failed: ${cmd}`);
    process.exit(1);
  }
}

function gitIsDirty(dir) {
  const result = spawnSync('git status --porcelain', { shell: true, cwd: dir });
  return result.stdout && result.stdout.toString().trim().length > 0;
}

// Read pins from framework-pins.json
const pinsPath = resolve(repoRoot, 'framework-pins.json');
const pins = JSON.parse(readFileSync(pinsPath, 'utf8'));

const ZFB_REPO = pins['zfb'].repo;
const ZFB_SHA = pins['zfb'].sha;

const zfbDir = resolve(repoRoot, '../zfb');

// Helper: clone or checkout a sibling repo to a pinned SHA
function setupSibling(label, repo, sha, siblingDir) {
  console.log(`\n[setup-upstream] ${label} → ${sha.slice(0, 7)}`);

  if (!existsSync(siblingDir)) {
    console.log(`  Cloning ${repo}...`);
    run(`git clone "${repo}" "${siblingDir}"`, repoRoot);
    run(`git -C "${siblingDir}" checkout "${sha}"`);
  } else {
    if (gitIsDirty(siblingDir)) {
      console.error(
        `\nError: ${siblingDir} has uncommitted changes.\n` +
        `Run \`pnpm dev-wip-package-upstream-wt-dev\` to work with a local zfb build.\n` +
        `Or stash/discard the changes and re-run setup:upstream.`
      );
      process.exit(1);
    }
    console.log(`  Fetching ${label}...`);
    run(`git -C "${siblingDir}" fetch`);
    run(`git -C "${siblingDir}" checkout "${sha}"`);
  }
}

setupSibling('zfb', ZFB_REPO, ZFB_SHA, zfbDir);

// Install zfb workspace deps (required by zfb's build.rs + example bundling)
console.log('\n[setup-upstream] Installing zfb workspace deps...');
run('pnpm install --frozen-lockfile', zfbDir);

// Install zfb CLI into project-local .zfb-bin/ (no --force on global ~/.cargo/bin)
const zfbBinDir = resolve(repoRoot, '.zfb-bin');
console.log('\n[setup-upstream] Installing zfb CLI into .zfb-bin/...');
run(`cargo install --path "${resolve(zfbDir, 'crates/zfb')}" --root "${zfbBinDir}"`);

// Run pnpm install in this consumer
console.log('\n[setup-upstream] Installing consumer deps...');
run('pnpm install', repoRoot);

// Verify build
console.log('\n[setup-upstream] Running pnpm build to verify...');
run('pnpm build', repoRoot);

console.log('\n[setup-upstream] Done. Run `pnpm dev` to start the dev server.\n');

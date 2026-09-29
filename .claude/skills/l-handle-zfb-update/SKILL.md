---
name: l-handle-zfb-update
description: >-
  Update the zfb upstream dependency (@takazudo/zfb + @takazudo/zfb-runtime) to
  the latest stable release, review the upstream changes between versions, and
  adapt this project's code if needed. Use when: (1) User says 'update zfb',
  'bump zfb', 'zfb update', or 'handle zfb update', (2) A new zfb release is out
  and this example blog should track it.
user-invocable: true
argument-hint: "[target-version, e.g. 2.3.0 — omit to use the latest stable]"
---

# Handle zfb Update

Update `@takazudo/zfb` and `@takazudo/zfb-runtime` to the latest stable release,
check what changed upstream, and adapt this project's code when an upstream
change touches a feature this blog actually uses.

Upstream repo: `Takazudo/zudo-front-builder` (monorepo; the npm packages live
under `packages/`). Every release has a `v<version>` tag and a GitHub release
with detailed notes.

## Step 0: Preconditions

`package.json` and `pnpm-lock.yaml` must be clean (`git status --short` shows
neither). If either has uncommitted changes, stop and ask the user before
touching them.

## Step 1: Resolve current and target versions

```bash
CURRENT=$(node -p "require('./package.json').dependencies['@takazudo/zfb']")
TARGET=$(npm view @takazudo/zfb dist-tags.latest)
```

- **Always resolve the target from the `latest` dist-tag, never `next`** — this
  project tracks the zfb stable line. The `next` prerelease line ENDED at
  `1.1.0-next.1`, which is a prerelease of the already-released `1.1.0`; the
  `next` dist-tag still points there and is now permanently behind. Following
  it would pin this repo to a superseded prerelease.
- If the user passed a version argument, use it as `TARGET` instead. Verify it
  exists for **both** packages: `npm view "@takazudo/zfb@<TARGET>" version`
  and `npm view "@takazudo/zfb-runtime@<TARGET>" version`.
- **If `CURRENT` equals `TARGET`: report "already at the latest stable
  (<version>)" and STOP.**
- **If `TARGET` is older than `CURRENT`** (possible with an explicit version
  argument): that is a downgrade — stop and ask the user to confirm before
  proceeding. The enumeration step below detects this case. Additionally,
  **never go below `3.0.0`**: the project uses the zfb 3 config (`wind`, no
  `framework` key), the owned zudo-react JSX runtime, and signal-based
  islands, none of which exist in 2.x.
- **If `TARGET` crosses a major version** (e.g. `3.x → 4.0.0`): treat it as a
  runtime migration, not a two-line package edit. Read that major's upstream
  migration guide (`docs/src/content/docs/guides/migrating-to-v<N>.mdx` in
  the upstream repo at the release tag) before Step 3. Step 5's full
  verification, including the browser comparison and the hydrated-island
  checks, is mandatory before merging.

## Step 2: Review upstream changes BEFORE bumping

Enumerate every version between `CURRENT` (exclusive) and `TARGET` (inclusive)
from npm's publish-ordered version list — do NOT sort version strings
lexically; prerelease numbers like `next.9` vs `next.10` sort wrong as text:

```bash
node -e '
const vs = JSON.parse(process.argv[1]);
const cur = vs.indexOf(process.argv[2]), tgt = vs.indexOf(process.argv[3]);
if (tgt < 0) { console.error("target not found"); process.exit(1); }
if (cur >= 0 && tgt <= cur) { console.error("target is not newer than current — downgrade or same"); process.exit(1); }
console.log(vs.slice(cur + 1, tgt + 1).join("\n"));
' "$(npm view @takazudo/zfb versions --json)" "$CURRENT" "$TARGET"
```

Read the release notes for EVERY enumerated version, not just the target's:

```bash
gh release view "v<version>" --repo Takazudo/zudo-front-builder --json body -q '.body'
```

If a release has no notes, fall back to the commit list:

```bash
gh api "repos/Takazudo/zudo-front-builder/compare/v<prev>...v<version>" \
  --jq '.commits[].commit.message' | head -40
```

**Fail closed:** if the upstream changes cannot be reviewed at all (gh
unauthenticated/rate-limited AND no readable release notes), stop and ask the
user — never bump blind.

Flag anything that touches a surface this project uses:

| Upstream surface | Where this project uses it |
| --- | --- |
| `defineConfig` schema (`@takazudo/zfb/config`) | `zfb.config.ts` — `base`, `wind` (`reset: "owned-v1"`, `authoredClasses`), `collections` |
| zudo-wind reset + candidate scanning | `owned-v1` reset under all authored CSS; every `class="…"` token is scanned — BEM `__` names need `wind.authoredClasses` (zfb#3365). Watch reset contents and candidate-grammar changes |
| zudo-react JSX runtime (`@takazudo/zfb/zudo-react`) | `tsconfig.json` `jsxImportSource`; `Child` in `layouts/default.tsx` / `components/note.tsx`; HTML attribute spellings (`class`, `charset`, `datetime`); `rawHtml` for the theme bootstrap script |
| Content collections API (`@takazudo/zfb/content`) | `pages/index.tsx`, `pages/blog/[slug].tsx`, `pages/tags/[tag].tsx` |
| Pagination API (`@takazudo/zfb/paginate`) | `pages/blog/page/[page].tsx` |
| Dynamic-route contracts (`paths()`, `getStaticProps()`) | all files under `pages/` with `[bracket]` names |
| Islands + signals runtime (`<Island>`, `signal`/`computed`/`getScope`) | `components/theme-toggle.tsx` island (setup-once, `onActivate` + `effect`, `on:click`), hydrated via `<Island when="idle">` in `layouts/default.tsx` |
| Content type shapes (`CollectionEntry`, `defaultComponents`, `components` prop) | `lib/types.ts` (`BlogEntry = CollectionEntry<BlogFrontmatter>`); `<post.Content components={{ ...defaultComponents, Note }} />` in `pages/blog/[slug].tsx` |
| CSS pipeline (authored CSS + generated layer order) | `styles/global.css` (`@layer base` / `@layer components` above wind's `zw-reset`), emitted `styles-*.css` |
| CLI commands (`zfb dev/build/preview/check`) | `package.json` scripts |
| Markdown / MDX pipeline | `content/blog/*.md`, `content/blog/*.mdx` |
| Documented behavior (page count, commands, architecture) | `README.md` hard-codes the 15-page breakdown, command table, and the zudo-react / zudo-wind description; `content/blog/why-rust-cli.md` describes the renderer |

**Rule: adapt only if this project actually uses the changed feature.**
Internal zfb changes (Rust internals, docs, zudo-wind utility/token
families — this blog uses no utility classes) need no action — note them in
the report and move on.

## Step 3: Bump both packages

```bash
pnpm add -E "@takazudo/zfb@$TARGET" "@takazudo/zfb-runtime@$TARGET"
```

- `-E` keeps the repo's **exact pin, no caret** convention — this repo
  deliberately moved off `^` pins so the example tracks one known-good zfb
  version; keep it that way.
- Both packages must land on the **same** version.
- Commit `package.json` AND `pnpm-lock.yaml` together — CI installs with
  `pnpm install --frozen-lockfile` and fails on a stale lockfile.
- pnpm is the package manager here — npm is only for reading registry
  metadata in Steps 1-2.

## Step 4: Adapt project code (if Step 2 flagged anything)

Apply whatever the flagged release notes require — config schema migrations,
renamed/changed APIs, changed frontmatter expectations, island markup changes,
etc. Update `README.md` if commands or the emitted page count changed. If
nothing was flagged, skip this step.

## Step 5: Verify

Clean generated output first so a stale `dist/` cannot mask failures, then
build:

```bash
rm -rf ./dist ./.zfb ./.zfb-build
pnpm typecheck   # run first: `zfb check` explains attribute/type errors far better than a failed build
pnpm build       # expect all 15 pages built cleanly, no ZW*/ZR* diagnostics
pnpm typecheck   # collection types + tsc pass
```

Then inspect `dist/`:

- `styles-*.css` emitted and linked from the built HTML
- The stylesheet contains the `owned-v1` reset (`@layer zw-reset`), the
  `--blog-*` tokens, and every authored selector; each class in the built
  HTML has a matching selector
- Islands bundle emitted and referenced (theme-toggle hydrates)
- No stranded `zfb-tailwind-entry-*.css` temp files (a 2.x-era artifact;
  still ignored in `.gitignore`)

For a **major** bump, also compare against the previous version in a browser.
Build the old version in a separate `git worktree`, serve both with
`zfb preview --port <port> --host 127.0.0.1` on explicit free ports, then:

- capture full-page screenshots of every route at a narrow (375px) and a wide
  (1280px) viewport in **both themes** (dark via `localStorage`
  `basic-blog:theme=dark`), in Chromium and WebKit, only after the island has
  mounted, and pixel-diff them;
- diff computed styles on a fixture page that contains the prose elements no
  post uses yet (`pre`, `blockquote`, `hr`, `ol`, `h2`/`h3`), because a font
  stack change can look pixel-identical on one OS;
- exercise the theme toggle after **real hydration**: wait for
  `[data-zfb-island="ThemeToggle"][data-zfb-island-mounted]` (SSR markup with a
  button is not evidence it is interactive), click it, and check that
  `html[data-theme]`, the label, `aria-pressed` and `aria-label` all flip and
  the value persists. Hard-reload with a saved dark theme and prove there is no
  light flash with a MutationObserver on `html[data-theme]`. Also check the
  no-stored-value + dark system theme case and a throwing `localStorage`;
- check that there are no console errors or failed requests.

Run the smoke test only against an explicit local URL, because its default
target is the live production host:
`SMOKE_BASE_URL=http://127.0.0.1:<port> node scripts/smoke.mjs`. Record a real
pass, not a skip notice.

Optional but recommended — dev-server smoke test. Note `pnpm dev` wipes
`dist/` via the `predev` script, so do this AFTER the dist inspection and
re-run `pnpm build` if you need the artifacts again:

```bash
pnpm dev   # then check key routes return 200: /, /blog/<slug>/, /blog/page/2/, /tags/<tag>/
```

If verification fails, map the failure back to the release notes from Step 2 —
it usually points at an upstream change that needs a project-side adaptation
(return to Step 4).

## Step 6: Report

Summarize for the user:

- Versions traversed (e.g. `2.1.0 → 2.3.0`)
- Notable upstream changes per release (one line each)
- Adaptations made to project code (or "none needed")
- Verification results (build page count, typecheck, dist inspection, smoke test)

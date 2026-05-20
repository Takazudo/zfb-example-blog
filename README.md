# zfb-example-blog

A polished, Tailwind-styled blog built with [zfb](https://github.com/Takazudo/zudo-front-builder)
(`zudo-front-builder`) — a Rust-orchestrated static site builder with
server-rendered Preact pages and selective client-side hydration ("islands").

**Live demo:** https://zfb-example-blog.pages.dev/

This is one of three official standalone zfb example sites. It demonstrates the
smallest realistic shape of a content-driven zfb project:

- A `blog` content collection of Markdown + MDX posts.
- File-based routing with three dynamic-route shapes — per-post pages,
  paginated index pages, and per-tag pages.
- A custom MDX component (`<Note>`) delivered through the `components` prop.
- A `"use client"` island (`ThemeToggle`) with an SSR-safe first render and a
  pre-hydration script that avoids a flash of the wrong theme.
- A Tailwind v4 `@theme` + CSS-custom-property design system with a
  light/dark theme driven by a `data-theme` attribute.

`zfb build` emits **14 fully-rendered HTML pages**: 1 homepage, 5 posts,
2 paginated index pages (pageSize 3 over 5 posts), and 6 tag pages.

## Repository layout

zfb is not yet published to npm. This repo consumes it from a **sibling
checkout** via `file:` dependencies in `package.json`:

```
~/repos/zfb-ex/
  zfb/                  <- the zudo-front-builder repo (the upstream)
  zfb-example-blog/     <- this repo
```

`package.json` points at `file:../zfb/packages/zfb` and
`file:../zfb/packages/zfb-runtime`, and the `zfb` CLI is built from
`../zfb/crates/zfb`. The exact upstream commit is pinned in
[`framework-pins.json`](./framework-pins.json).

## Setup (fresh checkout)

On a machine that does not yet have the `zfb` sibling, the bootstrap script
clones it at the pinned SHA, installs its workspace deps, builds the `zfb` CLI
into a project-local `.zfb-bin/`, then installs and builds this repo:

```sh
pnpm setup:upstream
```

If the `zfb` sibling already exists at `../zfb` and the `zfb` CLI is already on
your `PATH`, you can skip the bootstrap and just run:

```sh
pnpm install
pnpm build
```

Requires Node.js >= 22.12.0, pnpm 10.x, and a Rust toolchain (for building the
`zfb` CLI).

## Commands

| Command            | What it does                                              |
| ------------------ | --------------------------------------------------------- |
| `pnpm dev`         | Start the zfb dev server with live reload.                |
| `pnpm build`       | Build the static site into `dist/` (14 pages).            |
| `pnpm preview`     | Serve the built `dist/` locally.                          |
| `pnpm typecheck`   | Run `zfb check` (collection validation + `tsc --noEmit`). |
| `pnpm setup:upstream` | Bootstrap the `zfb` sibling for a fresh checkout.      |

## Project structure

```
content/blog/      Markdown + MDX posts (the `blog` collection)
components/        note.tsx (MDX component), theme-toggle.tsx (island)
layouts/           default.tsx — shared page chrome
lib/               types.ts — shared BlogEntry/frontmatter types
pages/             index.tsx + dynamic routes ([slug], page/[page], tags/[tag])
styles/            global.css — Tailwind v4 @theme + design tokens
zfb.config.ts      framework: preact, tailwind enabled, blog collection
```

## Deployment

Pushes to `main` are deployed to Cloudflare Pages by
[`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml). The workflow
clones the `zfb` sibling inline at the pinned SHA, builds the CLI, runs
`pnpm build`, and deploys `dist/` to the `zfb-example-blog` Pages project.
It needs the repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

## Post-merge pin-bump procedure

`framework-pins.json` currently pins the zfb `base/demo-separation` branch HEAD:

```
1a01628843286354c676813d8b63a52feb01cff8
```

This is the demo-separation epic's working branch. **Once epic PR #319 merges
`base/demo-separation` into `main` in the zfb repo, this pin must be bumped.**

`base/demo-separation` becomes a dead branch after the merge and may be deleted.
If it is deleted, the `git checkout <sha>` step in CI — and `pnpm setup:upstream`
locally — would fail, because the pinned commit no longer has a reachable ref.
`main` is the durable ref.

To bump:

1. After PR #319 merges, find the **merge commit SHA on `main`** in the zfb repo.
2. In this repo, edit `framework-pins.json` and replace `zfb.sha` with that
   `main` merge commit SHA.
3. Commit and push. CI re-clones zfb at the new SHA and re-deploys.

S8 of the demo-separation epic verifies and finalizes this bump.

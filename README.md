# zfb-example-blog

A polished, Tailwind-styled blog built with [zfb](https://github.com/Takazudo/zudo-front-builder)
(`zudo-front-builder`) — a Rust-orchestrated static site builder with
server-rendered Preact pages and selective client-side hydration ("islands").

**Live demo:** https://zfb-example-blog.takazudomodular.com/

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

`zfb build` emits **15 fully-rendered HTML pages**: 1 homepage, 5 posts,
2 paginated index pages (pageSize 3 over 5 posts), 6 tag pages, and 1 error
page (`404.html`).

## Dependencies

zfb is consumed from npm: [`@takazudo/zfb`](https://www.npmjs.com/package/@takazudo/zfb)
(the CLI, shipping prebuilt platform binaries) and
[`@takazudo/zfb-runtime`](https://www.npmjs.com/package/@takazudo/zfb-runtime)
(the runtime library). A plain `pnpm install` provides everything, including
the `zfb` CLI in `node_modules/.bin/` — no Rust toolchain or upstream checkout
is needed.

## Setup (fresh checkout)

```sh
pnpm install
pnpm build
```

Requires Node.js >= 22.12.0 and pnpm 10.x.

## Commands

| Command            | What it does                                              |
| ------------------ | --------------------------------------------------------- |
| `pnpm dev`         | Start the zfb dev server with live reload.                |
| `pnpm build`       | Build the static site into `dist/` (15 pages).            |
| `pnpm preview`     | Serve the built `dist/` locally.                          |
| `pnpm typecheck`   | Run `zfb check` (collection validation + `tsc --noEmit`). |

## Project structure

```
content/blog/      Markdown + MDX posts (the `blog` collection)
components/        note.tsx (MDX component), theme-toggle.tsx (island)
layouts/           default.tsx — shared page chrome
lib/               types.ts — shared BlogEntry/frontmatter types
pages/             index.tsx + dynamic routes ([slug], page/[page], tags/[tag])
                   404.tsx — emits a flat dist/404.html (see wrangler.toml)
styles/            global.css — Tailwind v4 @theme + design tokens
zfb.config.ts      framework: preact, tailwind enabled, blog collection
```

## Deployment

Pushes to `main` are deployed to **Cloudflare Workers** (static assets) by
[`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml), and served at
the custom domain **https://zfb-example-blog.takazudomodular.com/**.

The site is a pure static build, so the Worker is **assets-only**: there is no
Worker script, just `dist/` served from Cloudflare's edge. All of that is
declared in [`wrangler.toml`](./wrangler.toml); `wrangler deploy` both uploads
the assets and attaches the custom domain.

The workflow has three jobs:

| Job       | Runs on            | What it does                                                     |
| --------- | ------------------ | ---------------------------------------------------------------- |
| `build`   | every push and PR  | `pnpm typecheck` + `pnpm build`. No credentials — forks stay green. |
| `deploy`  | push to `main`     | `wrangler deploy`, then the live-site smoke test.                  |
| `preview` | pull requests      | Uploads a preview version and comments its URL on the PR.          |

It needs the repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`;
the credentialed jobs self-skip when the token is absent.

For an ordered "from zero to deployed" walkthrough — creating the token,
setting the secrets, triggering, verifying, and troubleshooting — see
[`docs/cloudflare-setup.md`](./docs/cloudflare-setup.md).

### Post-deploy smoke test

[`scripts/smoke.mjs`](./scripts/smoke.mjs) runs after every production deploy
and checks the real hostname over the network: each check asserts an exact
status (redirects are not followed) plus page content unique to this blog — a
literal `200` on the homepage and a post route, and a `404` serving our own
error page on an unmatched path, which is the only way to prove
`not_found_handling` actually works at the edge. A deploy can report success
while the custom domain is unattached or serving something else — this is the
only check that can see that.

It **skips cleanly** (exit 0) while the domain has no DNS record yet, so the
repo is not red-by-design before Cloudflare is wired up. Once the name resolves,
every failure is a real failure. Run it by hand against any host with:

```sh
SMOKE_BASE_URL=https://zfb-example-blog.takazudomodular.com node scripts/smoke.mjs
```

### Cloudflare API token permissions

The `CLOUDFLARE_API_TOKEN` repo secret is a custom token (Cloudflare dashboard →
My Profile → API Tokens → Create Custom Token) with these permissions:

| Type    | Resource         | Level |
| ------- | ---------------- | ----- |
| Account | Workers Scripts  | Edit  |
| Account | Account Settings | Read  |
| Zone    | Workers Routes   | Edit  |

Set **Account Resources → Include → (your account)**, and **Zone Resources →
Include → takazudomodular.com**.

**Zone · Workers Routes — Edit is required** because this repo serves a custom
domain. Without it `wrangler deploy` uploads the Worker and then fails when it
tries to create the route, and the domain never resolves. (This is the one
permission the older Pages-era setup did not need, and the reason the migration
notes say a deploy can fail on the route step alone.)

A single token can be shared across all `zfb-example-*` repos if it carries the
union of every repo's permissions.

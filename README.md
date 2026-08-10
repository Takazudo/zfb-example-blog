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
| `pnpm build`       | Build the static site into `dist/` (14 pages).            |
| `pnpm preview`     | Serve the built `dist/` locally.                          |
| `pnpm typecheck`   | Run `zfb check` (collection validation + `tsc --noEmit`). |

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
runs `pnpm install` + `pnpm build` and deploys `dist/` to the
`zfb-example-blog` Pages project. It needs the repo secrets
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

For an ordered "from zero to deployed" walkthrough — creating the token,
setting the secrets, triggering, verifying, and troubleshooting — see
[`docs/cloudflare-setup.md`](./docs/cloudflare-setup.md).

### Cloudflare API token permissions

The `CLOUDFLARE_API_TOKEN` repo secret is an **Account**-scoped custom token
(Cloudflare dashboard → My Profile → API Tokens → Create Custom Token) with
these permissions:

- **Cloudflare Pages** — Edit
- **Account Settings** — Read

Set **Account Resources → Include → (your account)**. No Zone permissions are
needed — this repo deploys to a `*.pages.dev` host, not a custom domain. A
single token can be shared across all `zfb-example-*` repos if it carries the
union of every repo's permissions.

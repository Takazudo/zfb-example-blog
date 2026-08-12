# Cloudflare setup — from zero to deployed

> **Status: the custom domain is pending one token permission.** This repo was
> migrated from Cloudflare **Pages** to **Workers static assets**. The two repo
> secrets are set, but the shared API token does not yet carry
> **Zone · Workers Routes · Edit**, so `wrangler deploy` uploads the Worker and
> then fails when it tries to create the custom-domain route. Add that
> permission (step 1) and re-run the deploy (step 3) to finish the migration.

Deployment is handled entirely by
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml). It builds the
site and runs `wrangler deploy`, which uploads `dist/` as the Worker's static
assets **and** attaches the custom domain declared in
[`wrangler.toml`](../wrangler.toml).

There is nothing to provision by hand: deploying a Worker name that does not
exist yet is how the Worker gets created. Do **not** use the dashboard's "Create
a Worker" wizard — it produces an orphan Worker or a competing git-build
pipeline that fights this workflow.

This site is a **pure static** build, so the Worker is *assets-only*: no
`main` entry, no Worker script, no bindings, no secrets.

| | |
| --- | --- |
| Worker name | `zfb-example-blog` |
| Custom domain | `zfb-example-blog.takazudomodular.com` |
| Zone | `takazudomodular.com` |
| Asset directory | `dist/` (built by `zfb build`) |

## 1. Create (or update) the Cloudflare API token

All `zfb-example-*` repos share **one** account-scoped token. Before minting a
new one, check whether that shared token already exists — see
[the family-wide token and env setup guide](https://github.com/Takazudo/zfbex-tweaker/blob/main/docs/cloudflare-shared-token-and-env-setup.md),
which is the source of truth for the shared credential and the permission union
it must carry.

Cloudflare dashboard → **My Profile** → **API Tokens** → **Create Custom
Token** (or edit the existing shared token), with these permissions:

| Type    | Resource         | Level | Why |
| ------- | ---------------- | ----- | --- |
| Account | Workers Scripts  | Edit  | `wrangler deploy` uploads the Worker |
| Account | Account Settings | Read  | wrangler resolves account metadata |
| Zone    | Workers Routes   | Edit  | attaching the custom domain |

- **Account Resources → Include → (your account)**
- **Zone Resources → Include → takazudomodular.com**

> **The Zone permission is the one that is easy to miss.** The old Pages setup
> for this repo needed no Zone permissions at all, because it deployed to a
> `*.pages.dev` host. A custom domain changes that: without
> **Zone · Workers Routes · Edit** the Worker still uploads and the deploy still
> reports progress, but route creation fails and the domain never resolves.

Copy the token value now; Cloudflare shows it exactly once. You also need your
**Account ID**, visible in the dashboard URL
(`https://dash.cloudflare.com/<account-id>`) or via `wrangler whoami`.

## 2. Set the two GitHub Actions secrets

```sh
gh secret set CLOUDFLARE_API_TOKEN  --repo Takazudo/zfb-example-blog
gh secret set CLOUDFLARE_ACCOUNT_ID --repo Takazudo/zfb-example-blog
```

Each command prompts for the value on stdin, which keeps the token out of your
shell history. Confirm both landed:

```sh
gh secret list --repo Takazudo/zfb-example-blog
```

Until `CLOUDFLARE_API_TOKEN` exists, the `deploy` and `preview` jobs self-skip
with a `::notice::` rather than failing — a fresh clone or a fork is green.

## 3. Trigger a deploy

The `deploy` job runs on every push to `main`. To deploy the current `main`
without a code change, re-run the most recent run:

```sh
gh run list  --repo Takazudo/zfb-example-blog --workflow=deploy.yml --limit 5
gh run rerun --repo Takazudo/zfb-example-blog <run-id>
gh run watch --repo Takazudo/zfb-example-blog <run-id>
```

You can also deploy from your machine:

```sh
pnpm build
pnpm exec wrangler deploy
```

To validate `wrangler.toml` **without credentials and without deploying**:

```sh
pnpm exec wrangler deploy --dry-run
```

## 4. Verify the live site

The workflow already does this automatically — the **Smoke test the live site**
step runs [`scripts/smoke.mjs`](../scripts/smoke.mjs) after each deploy. To run
the same check by hand:

```sh
node scripts/smoke.mjs
```

It asserts an exact status per check (redirects are not followed, so a redirect
back to the old Pages site cannot pass), plus HTML content unique to this blog:
a literal `200` on both `/` and `/blog/hello-zfb/`, and a `404` on an unmatched
path that must serve our own error page rather than Cloudflare's bare one —
the only way to prove `not_found_handling = "404-page"` works at the edge.
While the domain has no DNS record it prints a `::notice::` and exits 0; once
the name resolves, any failure is a real failure.

A quick manual check:

```sh
curl -sI https://zfb-example-blog.takazudomodular.com/ | head -1   # expect: HTTP/2 200
```

Then open the site and confirm the blog index renders, a post page loads, and
the `ThemeToggle` island switches themes — that last one proves hydration
shipped, not just HTML.

Pull requests get their own preview URL. The `preview` job runs
`wrangler versions upload --preview-alias pr-<N>`, which uploads a version
**without** touching routes, and posts the resulting `*.workers.dev` URL as a PR
comment. Previews therefore never publish to the custom domain. Fork PRs receive
no secrets, so the preview job is skipped for them.

## The old Pages project

The migration does not delete the old `zfb-example-blog` Pages project, and it
does not need to be deleted for the Workers deploy to work. It simply stops
receiving deploys. Remove it once you are satisfied the Workers deploy is
healthy and you no longer want the `zfb-example-blog.pages.dev` URL alive.

## Troubleshooting

**The deploy fails creating the route / the domain never resolves.** The token
is missing **Zone · Workers Routes · Edit**, or its **Zone Resources** does not
include `takazudomodular.com`. This is the known pending state described at the
top of this file. The Worker itself uploads fine, which is why the failure looks
late and confusing.

**`Authentication error [code: 10000]` on the deploy step.** The token is
expired, revoked, or was pasted with trailing whitespace. Re-run step 2. This is
also what a token missing **Account Settings — Read** looks like.

**The smoke test says "has no DNS record yet" and passes.** That is the
deliberate skip: the domain is not attached. It is not a green light — finish
step 1.

**The smoke test fails with "HTTP 200 but body is missing marker(s)".** The
domain resolves but serves something else — most likely it is still pointed at
the old Pages project, or at a different Worker on the zone.

**Wrong account.** `CLOUDFLARE_ACCOUNT_ID` and the token must belong to the same
account. A token from account A plus an ID from account B authenticates fine and
then fails to find the Worker.

**Build fails before deploy.** Not a Cloudflare problem. Reproduce locally with
`pnpm install && pnpm build`; the workflow uses `--frozen-lockfile`, so an
out-of-date `pnpm-lock.yaml` fails there first.

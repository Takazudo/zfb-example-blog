# Cloudflare setup — from zero to deployed

> **This repo is already live** at https://zfb-example-blog.pages.dev/. The two
> repo secrets are set and every push to `main` deploys today. Steps 1–2 below
> are therefore already done — follow them only when **rotating** the API token,
> **re-creating** the secrets, or standing this repo up on a **fresh Cloudflare
> account**. Steps 3–4 are the everyday verification path.

Deployment is handled entirely by
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml): it runs
`pnpm install` + `pnpm build` and deploys the generated `dist/` to the
Cloudflare **Pages** project `zfb-example-blog`. There is nothing to provision
by hand — the workflow creates the Pages project itself on first run
(`wrangler pages project create`, idempotent) — and no Worker secrets or
bindings are involved. This is a purely static deploy.

## 1. Create (or reuse) the Cloudflare API token

All nine `zfb-example-*` repos share **one** account-scoped token. Before
minting a new one, check whether that shared token already exists — see
[the family-wide token and env setup guide](https://github.com/Takazudo/zfbex-tweaker/blob/main/docs/cloudflare-shared-token-and-env-setup.md),
which is the source of truth for the shared credential and the permission union
it must carry.

To create a token for this repo alone: Cloudflare dashboard → **My Profile** →
**API Tokens** → **Create Custom Token**, with exactly these permissions:

| Type    | Resource         | Level |
| ------- | ---------------- | ----- |
| Account | Cloudflare Pages | Edit  |
| Account | Account Settings | Read  |

Then set **Account Resources → Include → (your account)**. No **Zone**
permissions are needed — this repo deploys to a `*.pages.dev` host, not a
custom domain. Copy the token value now; Cloudflare shows it exactly once.

You also need your **Account ID**, visible in the dashboard URL
(`https://dash.cloudflare.com/<account-id>`) or on any account's overview page.

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

## 3. Trigger a deploy

The workflow runs on every push to `main` and on every pull request targeting
`main`. To deploy the current `main` without a code change, re-run the most
recent run:

```sh
gh run list  --repo Takazudo/zfb-example-blog --workflow=deploy.yml --limit 5
gh run rerun --repo Takazudo/zfb-example-blog <run-id>
```

Watch it to completion:

```sh
gh run watch --repo Takazudo/zfb-example-blog <run-id>
```

## 4. Verify the live site

Production (pushes to `main`):

```sh
curl -sI https://zfb-example-blog.pages.dev/ | head -1   # expect: HTTP/2 200
```

Then open https://zfb-example-blog.pages.dev/ and confirm the blog index
renders, a post page loads, and the `ThemeToggle` island switches themes (that
last one proves hydration shipped, not just HTML).

Pull requests deploy to their own preview URL,
`https://<branch-slug>.zfb-example-blog.pages.dev/`, and the workflow posts it
as a PR comment. Slashes in a branch name become hyphens — Cloudflare Pages
branch names cannot contain `/`.

## Troubleshooting

**`Authentication error [code: 10000]` on the deploy step.** The token is
expired, revoked, or was pasted with trailing whitespace. Re-run step 2. This
is also what a token missing **Account Settings — Read** looks like.

**`project not found` or the create step fails with an unexpected error.** The
token lacks **Cloudflare Pages — Edit**, or **Account Resources** was not set to
include your account. Both make the project invisible to the token even when it
exists.

**Wrong account.** `CLOUDFLARE_ACCOUNT_ID` and the token must belong to the
same account. A token from account A plus an ID from account B authenticates
fine and then fails to find the project.

**Deploy retries three times, then fails.** The workflow already retries with a
150-second backoff, so three failures means a real error rather than a
transient Cloudflare hiccup — read the first attempt's log, not the last.

**Build fails before deploy.** Not a Cloudflare problem. Reproduce locally with
`pnpm install && pnpm build`; the workflow uses `--frozen-lockfile`, so an
out-of-date `pnpm-lock.yaml` fails there first.

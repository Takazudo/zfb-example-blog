#!/usr/bin/env node
// Post-deploy smoke test for the live site.
//
// A deploy can succeed and still leave the site unreachable: the Worker uploads
// fine, but the custom domain is not attached, points at the wrong Worker, or
// serves someone else's content. Only an over-the-wire check against the real
// hostname can catch that — no unit or build-level test can see it. This runs
// in CI after `wrangler deploy` (see .github/workflows/deploy.yml).
//
// SKIP vs FAIL — the important design decision:
//
//   The custom domain needs `Zone · Workers Routes · Edit` on the deploy token
//   before Cloudflare will create it, so there is a window where the domain
//   simply does not exist yet. The house rule is that the repo must not show a
//   red deploy before Cloudflare is wired up. So we resolve the hostname up
//   front and treat only a definitively absent DNS record as the skip signal:
//
//     no A and no AAAA record  -> not attached yet -> SKIP (::notice::, exit 0)
//     any address resolves     -> the domain is live, so everything after this
//                                 point is a real result -> failure is FAIL
//
//   Deciding this from DNS rather than from fetch() error codes keeps the skip
//   set as narrow as it can be. Once the name resolves, a refused connection, a
//   TLS error, a 5xx, a 404, a redirect, or a 200 carrying the wrong HTML all
//   mean the deploy is genuinely broken and must go red. Note that a resolver
//   failure (SERVFAIL/REFUSED/timeout) is NOT "the domain does not exist" — it
//   is a broken lookup, and it fails rather than skipping.

import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "https://zfb-example-blog.takazudomodular.com";

// Content markers, taken from the real `zfb build` output. A 200 alone proves
// almost nothing (a parked page, or the old Pages deploy, also returns 200) —
// these strings prove THIS blog is what the domain serves.
const CHECKS = [
  {
    path: "/",
    label: "homepage",
    markers: ["<title>basic-blog · zfb example</title>", "<h1>basic-blog</h1>"],
  },
  {
    path: "/blog/hello-zfb/",
    label: "blog post route",
    markers: ["<title>Hello, zfb</title>"],
  },
];

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 8_000;

// The only codes that mean "this hostname has no record", as opposed to "the
// lookup itself went wrong".
const DNS_ABSENT_CODES = new Set(["ENOTFOUND", "ENODATA"]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function notice(message) {
  console.log(`::notice::${message}`);
}

function error(message) {
  console.log(`::error::${message}`);
}

/**
 * True when the hostname has at least one A or AAAA record.
 * Throws when the resolver fails for any reason other than "no such record" —
 * a broken lookup must not be mistaken for an unattached domain.
 */
async function domainResolves(hostname) {
  if (isIP(hostname)) return true; // literal address (local runs); nothing to resolve

  const resolver = new Resolver({ timeout: 5_000, tries: 2 });
  const results = await Promise.allSettled([resolver.resolve4(hostname), resolver.resolve6(hostname)]);

  if (results.some((r) => r.status === "fulfilled" && r.value.length > 0)) return true;

  const codes = results.map((r) => (r.status === "rejected" ? r.reason?.code : "EMPTY"));
  if (codes.every((code) => DNS_ABSENT_CODES.has(code))) return false;

  throw new Error(
    `DNS lookup for ${hostname} failed for a reason other than a missing record (A: ${codes[0]}, AAAA: ${codes[1]}). Treating this as a failure, not a skip.`,
  );
}

/**
 * Fetch one URL and verify status + markers.
 *
 * redirect: "manual" is deliberate — the requirement is that the custom domain
 * itself answers 200. Following redirects would let a redirect to the old
 * Pages deploy pass as success.
 *
 * Retries transient conditions (network/TLS errors, timeouts, non-200) to ride
 * out edge propagation right after a deploy. A 200 whose body is missing the
 * markers is NOT retried — that is the wrong site being served, not a transient.
 */
async function checkOnce(url, markers) {
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { "user-agent": "zfb-example-blog-smoke/1.0" },
  });

  if (response.status !== 200) {
    const where = response.headers.get("location");
    return {
      ok: false,
      retryable: true,
      detail: `HTTP ${response.status}${where ? ` -> ${where}` : ""}`,
    };
  }

  const body = await response.text();
  const missing = markers.filter((marker) => !body.includes(marker));
  if (missing.length > 0) {
    return {
      ok: false,
      retryable: false,
      detail: `HTTP 200 but body is missing marker(s): ${missing.map((m) => JSON.stringify(m)).join(", ")}`,
    };
  }

  return { ok: true };
}

async function runCheck({ path, label, markers }) {
  const url = new URL(path, BASE_URL).toString();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let result;
    try {
      result = await checkOnce(url, markers);
    } catch (err) {
      // fetch() wraps the real reason on .cause; surface it so a failure log is
      // actionable rather than a bare "fetch failed".
      const reason = err.cause?.code ?? err.cause?.message ?? err.message;
      result = { ok: false, retryable: true, detail: `request failed (${reason})` };
    }

    if (result.ok) {
      console.log(`ok   ${label}: ${url}`);
      return true;
    }

    if (attempt === MAX_ATTEMPTS || !result.retryable) {
      error(`Smoke check failed — ${label} (${url}): ${result.detail}`);
      return false;
    }

    console.log(
      `retry ${label}: ${result.detail} (attempt ${attempt}/${MAX_ATTEMPTS}, waiting ${RETRY_DELAY_MS / 1000}s)`,
    );
    await sleep(RETRY_DELAY_MS);
  }

  return false;
}

async function main() {
  const { hostname } = new URL(BASE_URL);

  if (!(await domainResolves(hostname))) {
    notice(
      `${hostname} has no DNS record yet — skipping smoke test. The custom domain is attached by \`wrangler deploy\` and needs \`Zone · Workers Routes · Edit\` on CLOUDFLARE_API_TOKEN; see docs/cloudflare-setup.md.`,
    );
    return 0;
  }

  console.log(`Smoke testing ${BASE_URL}`);

  let failed = false;
  for (const check of CHECKS) {
    // Sequential so the log reads in order and a broken deploy is obvious.
    if (!(await runCheck(check))) failed = true;
  }

  if (failed) {
    error(`Smoke test FAILED against ${BASE_URL} — the domain resolves, so this is a real breakage.`);
    return 1;
  }

  console.log(`Smoke test passed: ${CHECKS.length} checks against ${BASE_URL}`);
  return 0;
}

process.exitCode = await main();

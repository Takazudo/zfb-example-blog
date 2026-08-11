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
//
//   Two states get past that DNS gate while the domain is still coming up, and
//   both would otherwise turn a perfectly working deploy red:
//
//     1. IPv6 before IPv4. Attaching a custom domain publishes the AAAA record
//        before the A record, and GitHub runners have no IPv6 route — so the
//        name resolves, the connection cannot leave the machine, and the run
//        fails on a site that is fine. Recognised narrowly: AAAA present, A
//        absent, and the connection failing as unreachable.
//     2. Edge certificate not issued yet. The hostname answers, but with a
//        certificate for some other name, so TLS fails with an altname
//        mismatch. An EXPIRED certificate is deliberately NOT in this set: a
//        freshly issued cert is never expired, so expiry can only mean an
//        established domain broke — exactly the outage this check exists to
//        catch.
//
// SMOKE_REQUIRE_LIVE=1 turns every one of those skips into a hard failure. Once
// a domain is known live there is no legitimate reason for the check to skip,
// and a silent ::notice:: is a poor way to learn the site fell off the internet.
// The skip paths stay in the code for repos that are not wired up yet; the flag
// is what retires them (deploy.yml sets it for this repo).

import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";

const BASE_URL =
  process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "https://zfb-example-blog.takazudomodular.com";

// When set, every skip below becomes exit 1. See the header.
const REQUIRE_LIVE = /^(1|true)$/i.test(process.env.SMOKE_REQUIRE_LIVE ?? "");

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

// "The connection never left this machine" — no route to that address family.
const UNREACHABLE_CODES = new Set(["ENETUNREACH", "EHOSTUNREACH"]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function notice(message) {
  console.log(`::notice::${message}`);
}

function error(message) {
  console.log(`::error::${message}`);
}

/**
 * Which address families the hostname currently publishes.
 * Throws when the resolver fails for any reason other than "no such record" —
 * a broken lookup must not be mistaken for an unattached domain.
 */
async function resolveDomain(hostname) {
  // Literal address (local runs); nothing to resolve.
  if (isIP(hostname)) return { ipv4: isIP(hostname) === 4, ipv6: isIP(hostname) === 6 };

  const resolver = new Resolver({ timeout: 5_000, tries: 2 });
  const [v4, v6] = await Promise.allSettled([resolver.resolve4(hostname), resolver.resolve6(hostname)]);
  const resolved = (r) => r.status === "fulfilled" && r.value.length > 0;

  if (resolved(v4) || resolved(v6)) return { ipv4: resolved(v4), ipv6: resolved(v6) };

  const codes = [v4, v6].map((r) => (r.status === "rejected" ? r.reason?.code : "EMPTY"));
  if (codes.every((code) => DNS_ABSENT_CODES.has(code))) return { ipv4: false, ipv6: false };

  throw new Error(
    `DNS lookup for ${hostname} failed for a reason other than a missing record (A: ${codes[0]}, AAAA: ${codes[1]}). Treating this as a failure, not a skip.`,
  );
}

/**
 * Every error code reachable from `err`.
 *
 * Walks `.cause` AND `AggregateError.errors` — Happy Eyeballs tries each
 * address in parallel and reports the real per-address code inside `.errors`,
 * while the aggregate itself carries none. A `.cause`-only walk sees nothing.
 */
function errorCodes(err) {
  const codes = [];
  const seen = new Set();

  const visit = (node) => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (typeof node.code === "string") codes.push(node.code);
    if (Array.isArray(node.errors)) node.errors.forEach(visit);
    visit(node.cause);
  };

  visit(err);
  return [...new Set(codes)];
}

/**
 * Reason string when the failure means "the domain is still coming up", or null
 * when it is a genuine breakage. See the two states described in the header.
 */
function notReadyReason(codes, { hostname, ipv4, ipv6 }) {
  if (ipv6 && !ipv4 && codes.some((code) => UNREACHABLE_CODES.has(code))) {
    return `${hostname} publishes an AAAA record but no A record yet, and this machine has no IPv6 route (${codes.join(", ")}). Cloudflare adds AAAA before A when attaching a custom domain, so this is the propagation window, not an unreachable site.`;
  }

  if (codes.includes("ERR_TLS_CERT_ALTNAME_INVALID")) {
    return `${hostname} resolves but serves a certificate for a different name (ERR_TLS_CERT_ALTNAME_INVALID) — the edge certificate for this custom domain has not been issued yet.`;
  }

  return null;
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

/**
 * Returns `{ ok }`, or `{ notReady }` when the last attempt showed the domain is
 * still coming up. A not-ready condition still burns the full retry budget
 * first: if the domain finishes converging mid-run we want the real assertions,
 * not a skip.
 */
async function runCheck({ path, label, markers }, dns) {
  const url = new URL(path, BASE_URL).toString();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let result;
    try {
      result = await checkOnce(url, markers);
    } catch (err) {
      // fetch() wraps the real reason on .cause; surface it so a failure log is
      // actionable rather than a bare "fetch failed".
      const codes = errorCodes(err);
      const reason = codes.join(", ") || err.cause?.message || err.message;
      result = {
        ok: false,
        retryable: true,
        notReady: notReadyReason(codes, dns),
        detail: `request failed (${reason})`,
      };
    }

    if (result.ok) {
      console.log(`ok   ${label}: ${url}`);
      return { ok: true };
    }

    if (attempt === MAX_ATTEMPTS || !result.retryable) {
      if (result.notReady) return { ok: false, notReady: result.notReady };
      error(`Smoke check failed — ${label} (${url}): ${result.detail}`);
      return { ok: false };
    }

    console.log(
      `retry ${label}: ${result.detail} (attempt ${attempt}/${MAX_ATTEMPTS}, waiting ${RETRY_DELAY_MS / 1000}s)`,
    );
    await sleep(RETRY_DELAY_MS);
  }

  return { ok: false };
}

/** Exit code for a "the domain is not up yet" verdict — skip, or fail under SMOKE_REQUIRE_LIVE. */
function finishNotReady(reason) {
  if (REQUIRE_LIVE) {
    error(`Smoke test FAILED against ${BASE_URL}: ${reason} SMOKE_REQUIRE_LIVE is set, so this is a failure rather than a skip.`);
    return 1;
  }

  notice(`Skipping smoke test — ${reason}`);
  return 0;
}

async function main() {
  const { hostname } = new URL(BASE_URL);
  const dns = await resolveDomain(hostname);

  if (!dns.ipv4 && !dns.ipv6) {
    return finishNotReady(
      `${hostname} has no DNS record yet. The custom domain is attached by \`wrangler deploy\` and needs \`Zone · Workers Routes · Edit\` on CLOUDFLARE_API_TOKEN; see docs/cloudflare-setup.md.`,
    );
  }

  console.log(`Smoke testing ${BASE_URL}`);

  let failed = false;
  for (const check of CHECKS) {
    // Sequential so the log reads in order and a broken deploy is obvious.
    const result = await runCheck(check, { hostname, ...dns });
    if (result.notReady) return finishNotReady(result.notReady);
    if (!result.ok) failed = true;
  }

  if (failed) {
    error(`Smoke test FAILED against ${BASE_URL} — the domain resolves, so this is a real breakage.`);
    return 1;
  }

  console.log(`Smoke test passed: ${CHECKS.length} checks against ${BASE_URL}`);
  return 0;
}

process.exitCode = await main();

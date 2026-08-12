import DefaultLayout from "../layouts/default";

/**
 * The not-found page. zfb special-cases a top-level `404.tsx` and emits a FLAT
 * `dist/404.html` — not `dist/404/index.html` like every other route. That exact
 * filename is what Cloudflare's `not_found_handling = "404-page"` looks for when
 * a request matches no asset (see wrangler.toml), and what `zfb preview` serves
 * locally, so preview and production behave the same.
 */
export default function NotFoundPage() {
  return (
    <DefaultLayout title="Page not found · basic-blog">
      <header class="page-hero">
        <h1>Page not found</h1>
        <p>
          That page does not exist. It may have been renamed or removed, or the link that brought
          you here may be out of date.
        </p>
      </header>
      <a class="back-link" href="/">
        ← Back home
      </a>
    </DefaultLayout>
  );
}

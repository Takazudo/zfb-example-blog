import type { ComponentChildren } from "preact";
import { Island } from "@takazudo/zfb";

import ThemeToggle from "../components/theme-toggle";
import "../styles/global.css";

/**
 * Inline pre-hydration script. Runs synchronously before the page paints,
 * reads the persisted theme preference (or `prefers-color-scheme`), and
 * sets `document.documentElement.dataset.theme` so the stylesheet picks
 * the correct palette on the very first frame. Must stay tiny, SSR-safe,
 * and self-contained — bundlers may not see this string.
 */
const THEME_BOOTSTRAP_SCRIPT = `(() => {
  try {
    var saved = localStorage.getItem("basic-blog:theme");
    var hasMM = typeof window !== "undefined" && typeof window.matchMedia === "function";
    var theme = saved === "light" || saved === "dark"
      ? saved
      : (hasMM && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
  } catch (e) {
    document.documentElement.dataset.theme = "light";
  }
})();`;

type Props = {
  title?: string;
  children: ComponentChildren;
};

/**
 * The single shared chrome for every page in the example. The `"use client"`
 * boundary is at `components/theme-toggle.tsx`, so this layout itself stays
 * a plain server component — only the toggle ships JS to the browser.
 */
export default function DefaultLayout({ title = "basic-blog · zfb example", children }: Props) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        {/* Inline SVG favicon mirroring the .site-title::before brand glyph. */}
        <link
          rel="icon"
          type="image/svg+xml"
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%232d5fd6'/><stop offset='1' stop-color='%237b9bff'/></linearGradient></defs><rect width='16' height='16' rx='4' fill='url(%23g)'/></svg>"
        />
        {/* Apply theme before paint to avoid FOUC. See script doc above. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        <header class="site-header">
          <a class="site-title" href="/">
            basic-blog
          </a>
          <nav class="site-nav">
            <a href="/blog/page/1">Posts</a>
            {/*
              The toggle is a `"use client"` island. Wrapping in `<Island>`
              is what marks it for the zfb hydration pipeline (Sub 3) and
              picks the scheduling strategy. `"idle"` keeps the toggle
              passive until the browser has spare cycles — chrome doesn't
              need to be interactive on the very first frame.
            */}
            <Island when="idle">
              <ThemeToggle />
            </Island>
          </nav>
        </header>
        <main class="site-main">{children}</main>
        <footer class="site-footer">
          <p>zfb basic-blog example · the smallest realistic shape of a zfb site.</p>
        </footer>
      </body>
    </html>
  );
}

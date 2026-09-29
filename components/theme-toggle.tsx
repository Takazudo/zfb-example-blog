"use client";

import { computed, getScope, signal } from "@takazudo/zfb/zudo-react";

type Theme = "light" | "dark";

const STORAGE_KEY = "basic-blog:theme";

/**
 * Theme toggle island.
 *
 * SSR contract: the server render and the markup the island adopts during
 * hydration MUST be identical, so the component starts from a deterministic
 * `"light"` instead of reading `localStorage` / `matchMedia` during setup —
 * the server has neither.
 *
 * zudo-react components run their setup ONCE. State lives in signals and
 * the button's text / ARIA attributes bind to `computed` signals, so they
 * stay live instead of freezing at the setup-time value.
 *
 * Lifecycle:
 *  - `onActivate` runs in the browser after the island adopts its server
 *    HTML and reads the persisted (or system) preference.
 *  - `effect` is queued only after activation callbacks have run, so its
 *    first run already sees the real preference and never writes the
 *    `"light"` default over a saved `"dark"`. It then mirrors every change
 *    to the document and to storage.
 *
 * To avoid a flash of the wrong colour scheme on the surrounding page, an
 * inline pre-hydration script in `<head>` (see `layouts/default.tsx`) sets
 * `document.documentElement.dataset.theme` synchronously, before the
 * stylesheet is parsed, so the page paints in the correct theme on the very
 * first frame regardless of which label this island renders first.
 */
function readPersistedTheme(): Theme | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") {
      return saved;
    }
  } catch {
    // Private browsing / disabled storage: fall through to system default.
    // This must not throw — an exception in an activation callback disposes
    // the island.
  }
  return null;
}

function readSystemTheme(): Theme {
  if (typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function ThemeToggle() {
  // Deterministic SSR-safe default. Real preference is applied on activation.
  const theme = signal<Theme>("light");
  const isDark = computed(() => theme.value === "dark");
  const buttonText = computed(() => (isDark.value ? "Light mode" : "Dark mode"));
  const ariaLabel = computed(() => `Switch to ${isDark.value ? "light" : "dark"} theme`);

  const scope = getScope();
  scope.onActivate(() => {
    theme.value = readPersistedTheme() ?? readSystemTheme();
  });
  // Mirror the active theme to the document and persist on change.
  scope.effect(() => {
    const current = theme.value;
    document.documentElement.dataset["theme"] = current;
    try {
      window.localStorage.setItem(STORAGE_KEY, current);
    } catch {
      // Storage unavailable; persistence is best-effort.
    }
  });

  return (
    <button
      type="button"
      class="theme-toggle"
      aria-pressed={isDark}
      aria-label={ariaLabel}
      on:click={() => {
        theme.value = isDark.value ? "light" : "dark";
      }}
    >
      {buttonText}
    </button>
  );
}

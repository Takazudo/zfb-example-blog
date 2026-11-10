import { defineConfig } from "@takazudo/zfb/config";

export default defineConfig({
  base: "/",
  // zudo-wind owns the reset. This blog styles everything with authored CSS
  // (styles/global.css) and uses no utility classes, so no tokens,
  // breakpoints, or dark binding are configured — only the reset that
  // replaces the Tailwind preflight the 2.x build imported. BEM `__`
  // names such as admonition__title are ordinary classes under spec 1
  // revision 14, so they need no authoredClasses allowlist.
  wind: {
    spec: 1,
    reset: "owned-v1",
  },
  collections: [
    {
      name: "blog",
      path: "content/blog",
      schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          date: { type: "string" },
          description: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["title", "date"],
      },
    },
  ],
});

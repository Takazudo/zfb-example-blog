import { defineConfig } from "@takazudo/zfb/config";

export default defineConfig({
  base: "/",
  // zudo-wind owns the reset. This blog styles everything with authored CSS
  // (styles/global.css) and uses no utility classes, so no tokens,
  // breakpoints, or dark binding are configured — only the reset that
  // replaces the Tailwind preflight the 2.x build imported.
  wind: {
    spec: 1,
    reset: "owned-v1",
    // Workaround for https://github.com/Takazudo/zudo-front-builder/issues/3365:
    // BEM `__` class names fail the build with ZW001; these have authored rules.
    authoredClasses: {
      admonition__title: true,
      admonition__body: true,
    },
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

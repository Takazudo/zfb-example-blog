import { defineConfig } from "@takazudo/zfb/config";

export default defineConfig({
  framework: "preact",
  base: "/",
  tailwind: {
    enabled: true,
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

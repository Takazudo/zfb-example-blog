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
    },
  ],
});

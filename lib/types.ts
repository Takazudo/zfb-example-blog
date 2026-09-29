/**
 * Shared types for the basic-blog example.
 *
 * `BlogEntry` is the SDK's own `CollectionEntry` shape — what
 * `getCollection("blog")` from `zfb/content` returns — narrowed to this
 * blog's frontmatter. Keep `BlogFrontmatter` in step with the collection's
 * `schema` in `zfb.config.ts`: the schema is what `zfb check` validates
 * post frontmatter against, this type is what the routes see.
 *
 * Each entry's `Content` renders the post body. Pass `components` to
 * override specific HTML tags or to inject custom JSX components used inside
 * MDX, e.g. `<Note>`:
 *
 * ```tsx
 * import { defaultComponents } from "@takazudo/zfb";
 * import Note from "../components/note";
 *
 * <post.Content components={{ ...defaultComponents, Note }} />
 * ```
 */
import type { CollectionEntry } from "@takazudo/zfb/content";

export type BlogFrontmatter = {
  title: string;
  date: string;
  description?: string;
  tags?: string[];
};

export type BlogEntry = CollectionEntry<BlogFrontmatter>;

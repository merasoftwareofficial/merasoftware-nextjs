/**
 * The tags already in use, offered while tagging a post.
 *
 * Reusing a tag is what lets its /topics page collect posts: a topic opens to
 * search only once it has MIN_POSTS.topic indexable posts (indexability.ts),
 * and a tag spelled a new way each time never gets there. So the most-used
 * tags come first, and tags that differ only in case or spacing count as one
 * (they share a topic address), shown in their most common spelling.
 */

import { blogRepo } from "@/lib/repo";
import { topicSlug } from "@/lib/topic-slug";

export async function tagSuggestions() {
  const byTopic = new Map<string, Map<string, number>>();
  for (const post of await blogRepo.listCards({})) {
    for (const tag of post.tags) {
      const spellings = byTopic.get(topicSlug(tag)) ?? new Map<string, number>();
      spellings.set(tag, (spellings.get(tag) ?? 0) + 1);
      byTopic.set(topicSlug(tag), spellings);
    }
  }
  return [...byTopic.values()]
    .map(spellings => {
      const [name] = [...spellings].sort((a, b) => b[1] - a[1])[0];
      const uses = [...spellings.values()].reduce((sum, count) => sum + count, 0);
      return { name, uses };
    })
    .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));
}

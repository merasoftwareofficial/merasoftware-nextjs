import { cookies } from "next/headers";
import { FollowButton } from "@/components/subscribe/follow-button";
import { getSessionUser } from "@/lib/auth";
import { NOTIFY_COOKIE } from "@/lib/notify-rules";
import { pushPublicKey } from "@/lib/push";
import { categoryRepo } from "@/lib/repo";
import { ownSubscriber } from "@/lib/subscription-actions";
import { topicMatches } from "@/lib/topic-slug";

/**
 * The follow button for one category, by its name (a post's category) or a
 * /topics slug. Nothing for a tag, an archived category, or no category.
 *
 * Like SubscribeBox: in production it shows only while push is configured;
 * outside production it always shows, so the design can be seen locally
 * without keys (owner decision, 2 Oct 2026).
 */
export async function FollowTopic({ name, slug, prompt = false }: { name?: string; slug?: string; prompt?: boolean }) {
  const pushKey = pushPublicKey();
  if (!pushKey && process.env.NODE_ENV === "production") return null;
  if (!name && !slug) return null;

  const [categories, user, store] = await Promise.all([categoryRepo.list(), getSessionUser(), cookies()]);
  const category = categories.find(item => !item.archived && (name ? item.name === name : topicMatches(item.name, slug!)));
  if (!category) return null;

  const mine = await ownSubscriber(null, user, store.get(NOTIFY_COOKIE)?.value);
  return (
    <FollowButton
      category={{ _id: category._id, name: category.name }}
      initial={{ categories: mine?.categories ?? [], offers: mine?.offers ?? false }}
      pushKey={pushKey}
      prompt={prompt}
    />
  );
}

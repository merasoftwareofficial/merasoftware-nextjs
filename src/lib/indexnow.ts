/**
 * IndexNow: tells Bing, Yandex and the other participating search engines the
 * moment a public post appears, changes or goes away, instead of waiting for
 * them to re-read sitemap.xml. Google does not take part; it keeps reading the
 * sitemap submitted in Search Console.
 *
 * Called from the data layer (repo/index.ts), so every way a post changes —
 * the editor, the status route, a schedule coming due, a delete — is covered
 * without each route remembering to do it.
 *
 * Rules:
 * - Only the live site sends. Local and preview deployments never do, or
 *   search engines would be told about URLs that are not public.
 * - Only posts a crawler may index are sent: published, public, not noindex —
 *   the same filter as sitemap.xml. A post that just stopped being indexable
 *   is sent once more, so the engines re-crawl and drop it.
 * - It never delays or breaks a save. The request goes out after the response
 *   and a failure is only logged.
 */

import { after } from "next/server";
import type { Blog } from "@/lib/repo/types";
import { SITE_URL } from "@/lib/structured-data";

const ENDPOINT = "https://api.indexnow.org/indexnow";

/** Served by src/app/indexnow-key.txt/route.ts; IndexNow fetches it to prove we own the host. */
export const KEY_PATH = "/indexnow-key.txt";

/** 8–128 letters, digits or dashes, as the protocol requires. Anything else counts as unset. */
export function indexNowKey() {
  const key = process.env.INDEXNOW_KEY?.trim();
  return key && /^[a-zA-Z0-9-]{8,128}$/.test(key) ? key : null;
}

function enabled() {
  return process.env.VERCEL_ENV === "production" && indexNowKey() !== null;
}

/** The same test sitemap.xml uses to list a post. */
export function isIndexable(post: Pick<Blog, "status" | "visibility" | "noIndex">) {
  return post.status === "published" && post.visibility === "public" && !post.noIndex;
}

/**
 * Report a change to one post. `before` is the post as it was (null when it is
 * new), `after` as it is now (null when it was deleted).
 */
export function notifyPostChange(before: Blog | null, now: Blog | null) {
  const urls = new Set<string>();
  // Indexable now: announce its address. Indexable before: announce the old
  // address too, which covers unpublish, noindex, delete and a changed slug.
  if (now && isIndexable(now)) urls.add(`${SITE_URL}/blog/${now.slug}`);
  if (before && isIndexable(before)) urls.add(`${SITE_URL}/blog/${before.slug}`);
  if (urls.size) submit([...urls]);
}

function submit(urlList: string[]) {
  if (!enabled()) return;
  const send = () => post(urlList);
  try {
    // Runs once the response has gone, so the editor never waits on a search engine.
    after(send);
  } catch {
    // Outside a request (no scope for after()), send straight away.
    void send();
  }
}

async function post(urlList: string[]) {
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: new URL(SITE_URL).host,
        key: indexNowKey(),
        keyLocation: `${SITE_URL}${KEY_PATH}`,
        urlList,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    // 200 and 202 both mean accepted; anything else is worth a line in the logs.
    if (!response.ok) console.error(`[indexnow] ${response.status} for ${urlList.join(", ")}`);
  } catch (error) {
    console.error("[indexnow] submit failed", error);
  }
}

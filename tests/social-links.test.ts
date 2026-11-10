import assert from "node:assert/strict";
import { test } from "node:test";
import { socialLinks, socialPlatformOf } from "../src/lib/social-links";

test("recognises the known profile hosts", () => {
  assert.equal(socialPlatformOf("https://www.facebook.com/profile.php?id=61563154147837"), "facebook");
  assert.equal(socialPlatformOf("https://www.instagram.com/merasoftware/"), "instagram");
  assert.equal(socialPlatformOf("https://www.youtube.com/@MeraSoftwareDigitalSolutions"), "youtube");
  assert.equal(socialPlatformOf("https://share.google/wBN26dvYmvJbGKgEZ"), "google");
});

test("ignores unknown hosts, plain http and junk", () => {
  assert.equal(socialPlatformOf("https://www.linkedin.com/company/x"), null);
  assert.equal(socialPlatformOf("http://www.instagram.com/merasoftware/"), null);
  assert.equal(socialPlatformOf("not a url"), null);
});

test("list keeps one icon per platform, in entry order, and appends WhatsApp", () => {
  const links = socialLinks(
    ["https://www.instagram.com/a/", "https://www.linkedin.com/x", "https://instagram.com/b/", "https://www.youtube.com/@c"],
    "+91 96530 13530",
  );
  assert.deepEqual(links.map(link => link.platform), ["instagram", "youtube", "whatsapp"]);
  assert.equal(links[0].href, "https://www.instagram.com/a/");
  assert.equal(links[2].href, "https://wa.me/919653013530");
});

test("empty profiles and no WhatsApp number give an empty list", () => {
  assert.deepEqual(socialLinks([], undefined), []);
});

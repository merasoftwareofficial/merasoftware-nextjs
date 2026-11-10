import assert from "node:assert/strict";
import { test } from "node:test";
import { whatsAppChatUrl, whatsAppPageMessage } from "../src/lib/whatsapp-link";

test("builds a wa.me link from any formatting of the number", () => {
  assert.equal(whatsAppChatUrl("+91 96530 13530"), "https://wa.me/919653013530");
  assert.equal(whatsAppChatUrl("919653013530"), "https://wa.me/919653013530");
});

test("adds the message encoded, and leaves it out when empty", () => {
  assert.equal(whatsAppChatUrl("919653013530", "Hi there & hello"), "https://wa.me/919653013530?text=Hi%20there%20%26%20hello");
  assert.equal(whatsAppChatUrl("919653013530", "   "), "https://wa.me/919653013530");
});

test("page message names the package or service when given", () => {
  assert.equal(whatsAppPageMessage("Digital Growth kit"), "Hi Mera Software, I would like to know more about Digital Growth kit.");
  assert.equal(whatsAppPageMessage(), "Hi Mera Software, I would like to know more about your services.");
  assert.equal(whatsAppPageMessage("Help customers find your business online."), "Hi Mera Software, I would like to know more about Help customers find your business online.");
});

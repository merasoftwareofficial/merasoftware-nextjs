import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import { getPortalAccount, portalEntryFor } from "../src/lib/portal";

process.env.TOKEN_SECRET_KEY = "session-regression-test-only";
process.env.PORTAL_API_URL = "http://session-test.invalid";
async function token(id: string, role = "customer") {
  return new SignJWT({ _id: id, role }).setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h").sign(new TextEncoder().encode(process.env.TOKEN_SECRET_KEY));
}
const account = (id: string, role = "customer", roles = [role]) => ({
  success: true, data: { _id: id, name: "Test", email: "test@example.invalid", role, roles },
});

test("portal link follows active role, including an admin switched to customer", () => {
  assert.deepEqual(portalEntryFor("customer", "https://portal.example"), { label: "My Portal", href: "https://portal.example/dashboard" });
  assert.deepEqual(portalEntryFor("admin", "https://portal.example"), { label: "Portal admin panel", href: "https://portal.example/admin-panel/dashboard" });
  for (const role of ["member", "manager", "developer", "partner", ""]) assert.equal(portalEntryFor(role, "https://portal.example"), null);
});

test("temporary HTTP failures do not cache a valid token as signed out", async () => {
  const previous = globalThis.fetch;
  const previousError = console.error;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return calls === 1 ? new Response(null, { status: 503 }) : Response.json(account("recovery"));
  };
  console.error = () => {};
  try {
    const signed = await token("recovery");
    assert.equal(await getPortalAccount(signed), null);
    assert.equal((await getPortalAccount(signed))?.id, "recovery");
    assert.equal((await getPortalAccount(signed))?.id, "recovery");
    assert.equal(calls, 2);
  } finally { globalThis.fetch = previous; console.error = previousError; }
});

test("a confirmed invalid session is cached, without repeated backend calls", async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(null, { status: 401 }); };
  try {
    const signed = await token("invalid-session");
    assert.equal(await getPortalAccount(signed), null);
    assert.equal(await getPortalAccount(signed), null);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = previous; }
});

test("account retains all roles for website permissions but uses the active role for portal entry", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json(account("multi-role", "customer", ["admin", "customer"]));
  try {
    const found = await getPortalAccount(await token("multi-role"));
    assert.deepEqual(found?.roles, ["admin", "customer"]);
    assert.equal(found?.activeRole, "customer");
  } finally { globalThis.fetch = previous; }
});

test("malformed successful responses do not cache the user as signed out", async () => {
  const previous = globalThis.fetch;
  const previousError = console.error;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json(calls === 1 ? { success: false } : account("malformed-recovery"));
  };
  console.error = () => {};
  try {
    const signed = await token("malformed-recovery");
    assert.equal(await getPortalAccount(signed), null);
    assert.equal((await getPortalAccount(signed))?.id, "malformed-recovery");
    assert.equal(calls, 2);
  } finally { globalThis.fetch = previous; console.error = previousError; }
});

import "server-only";
import { createHash } from "node:crypto";
import { resolvedTerms, type Offer } from "@/lib/offers";

// Settings that change when or where an offer is shown, never its price, scope or terms. They are
// left out of the quote key so changing them does not make a pending Reserve or an open portal
// project form ask for a refresh. Only add fields that offers saved before them never had: adding
// an existing field would change those offers' keys and their reservations' saved versions.
const DISPLAY_ONLY = ["reserveWindowHours"] as const;

// The integration API and customer page must sign exactly the same resolved terms.
export function offerWithQuote(offer: Offer, universal: string[]) {
  const value = { ...offer, resolvedTerms: resolvedTerms(offer, universal) };
  const signed: Record<string, unknown> = { ...value };
  for (const key of DISPLAY_ONLY) delete signed[key];
  return { ...value, quoteKey: createHash("sha256").update(JSON.stringify(signed)).digest("hex") };
}

import "server-only";
import { createHash } from "node:crypto";
import { resolvedTerms, type Offer } from "@/lib/offers";

// The integration API and customer page must sign exactly the same resolved terms.
export function offerWithQuote(offer: Offer, universal: string[]) {
  const value = { ...offer, resolvedTerms: resolvedTerms(offer, universal) };
  return { ...value, quoteKey: createHash("sha256").update(JSON.stringify(value)).digest("hex") };
}

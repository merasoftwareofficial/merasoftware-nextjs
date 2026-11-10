// How a new one-time package is priced (owner decision 10 Nov 2026): "automatic" = the main price comes from the portal's
// category base price and add-on services; "manual" = the admin types the main and discount price. The admin's last choice
// is remembered in this browser so the next new package opens the same way. Storage can be blocked (private window, site
// data cleared); then a new package simply opens automatic. A saved package keeps the way it was priced and never reads this.
export type PriceMode = "automatic" | "manual";
export const PRICE_MODE_KEY = "package-price-mode";
type Reader = Pick<Storage, "getItem">;
type Writer = Pick<Storage, "setItem">;

export function readPriceMode(storage?: Reader): PriceMode {
  try { return (storage ?? window.localStorage).getItem(PRICE_MODE_KEY) === "manual" ? "manual" : "automatic"; }
  catch { return "automatic"; }
}
export function rememberPriceMode(mode: PriceMode, storage?: Writer) {
  try { (storage ?? window.localStorage).setItem(PRICE_MODE_KEY, mode); }
  catch { /* Without storage the next new package opens automatic. */ }
}

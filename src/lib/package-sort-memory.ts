import type { PackageSort } from "./package-list";

// How the admin Packages list is sorted (owner decision 12 Nov 2026): a browser that has never chosen opens it by "Recently
// modified"; the sort the admin picks is remembered in this browser and used the next time, like the price mode of a new package
// (package-price-mode.ts). Storage can be blocked (private window, site data cleared); then the list opens by recently modified
// and the admin's pick still works until the page is closed.
export const ADMIN_SORT_KEY = "package-list-sort";
export const ADMIN_DEFAULT_SORT: PackageSort = "modified";
const SORTS: PackageSort[] = ["default", "price_asc", "price_desc", "added", "modified"];
type Reader = Pick<Storage, "getItem">;
type Writer = Pick<Storage, "setItem">;

export function readAdminSort(storage?: Reader): PackageSort {
  try {
    const saved = (storage ?? window.localStorage).getItem(ADMIN_SORT_KEY);
    return SORTS.find(sort => sort === saved) ?? ADMIN_DEFAULT_SORT;
  } catch { return ADMIN_DEFAULT_SORT; }
}
export function rememberAdminSort(sort: PackageSort, storage?: Writer) {
  try { (storage ?? window.localStorage).setItem(ADMIN_SORT_KEY, sort); }
  catch { /* Without storage the next visit opens by recently modified. */ }
}

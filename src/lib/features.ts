/**
 * Parts of the site that exist in code but stay switched off until they have
 * real content behind them. One switch per feature: every page, link, menu
 * entry, sitemap line and admin screen that belongs to it reads the same flag,
 * so turning it on brings all of it back at once.
 */
export const FEATURES = {
  /**
   * /work, the homepage "Selected work" section and every link to them.
   * Off since 30 Sep 2026: the two case studies (Northstar Advisory, Oasis
   * Living) came with the site template and are not real clients. Turn on
   * once real projects are added through a working Portfolio admin.
   */
  portfolio: false,
} as const;

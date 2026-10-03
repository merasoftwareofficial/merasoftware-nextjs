/**
 * Parts of the site that exist in code but stay switched off until they have
 * real content behind them. One switch per feature: every page, link, menu
 * entry, sitemap line and admin screen that belongs to it reads the same flag,
 * so turning it on brings all of it back at once.
 */
export const FEATURES = {
  /**
   * /work, the homepage "Selected work" section and every link to them.
   * Uses real published Portfolio records; template cards are never displayed.
   */
  portfolio: true,
} as const;

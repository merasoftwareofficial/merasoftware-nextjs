# Portal speed issue — hand-over

Updated 2 November 2026. Scope: the React portal (`E:\Allprojects\frontend`) and its Express backend (`E:\Allprojects\backend`). This is separate from `src/docs/speed.md`, the older website audit.

## 1. Where things stand

- Owner's latest check, live: "much better, but data still takes time". **The owner has decided the next job is data caching.**
- The screen flash and double loading are fixed and live. What remains is the wait for data after a screen opens.
- Nothing about caching is built yet. All repositories are pushed and clean on `main`, except this document's move.

| Repository | Latest commit |
|---|---|
| Portal frontend | `3b7ba7e` (live bundle was `main.6b925661.js` on 2 Nov) |
| Backend | `20e20a5` (pushed; its Render deploy was not separately confirmed) |
| Website | `0f01a7b` |

## 2. Why data is still slow (measured)

| Measurement | Result | How |
|---|---|---|
| Any API call, no database | median about 300ms | Live `/api/phone-countries`, 30 samples |
| One database query on top | about 240ms more | Live `/api/get-banner` compared with the above, 30 samples. An estimate: it may include some server work |
| One lead, after the fix | 13 database calls in about 4 rounds, about 1.3s, plus about 540ms for auth and network: about 1.8s | In-memory database behind a 240ms delay |
| Leads list, after the fix | 11 database calls in about 4 rounds, about 1.3–1.4s, plus the same 540ms | Same |

Not known yet:
- The real logged-in time. Set `LEAD_TIMING_ENABLED=true` on Render and read `[lead-timing]` lines (free plan keeps about 1 hour of logs), or read the browser's Network tab.
- **Render's region.** Asked, not answered. Atlas showed Mumbai in September. The 240ms suggests server and database are far apart. Moving closer could beat any cache for first visits, but a free service must be recreated to change region, so it is the owner's call.

The owner stays on free Render and free Atlas. Do not propose a paid plan as the answer.

## 3. What was done

### Phase 1: flash and double loading (frontend, live)

| Before | Now | Where |
|---|---|---|
| Every click hid the sidebar for about 300ms, because each visit created a new `lazy()` and `AdminLayout` sat inside each page | One shell stays mounted; one lazy component per page | `src/components/AdminShell.js`, `src/routes/index.js`, `src/routes/lazyPage.js` |
| Screen files loaded on first visit | Admin screen files preload when idle (about 274 KB; longest block 886ms on a 4x slower CPU) | `AdminShell`, `adminPageLoaders` in `src/routes/adminRoutes.js` |
| Each screen change closed and reopened the live connection, whose `ready` message read the data again | Shell holds the connection; 1 read per screen (Leads: list and count) | `AdminShell`, `src/hooks/usePortalUpdates.js` |
| Tabs and filters jumped the page; Back lost the list position | Tabs and filters stay put; position returns after data arrives | `src/helpers/scrollTop.js`, `src/hooks/useListScroll.js`, `useListState` |
| A new deploy left open tabs stuck on an error | One automatic reload, then an error beside the sidebar | `lazyPage.js` |
| Each page had its own logout, and two pages had a dead button | One logout in the shell | `AdminShell` |
| Clicking a lead showed "Loading..." | Name shows at once from the list; actions stay closed until full data arrives | `leadPreview` in `AdminLeadsPage.js`, `AdminLeadDetailPage.js` |

Sidebar order changed at the owner's request: Dashboard first, Settings last, Email Control is a button inside Settings.

### Phase 2: database calls (backend, pushed)

| Before | Now | Where |
|---|---|---|
| One lead: 11 calls in a row plus 2 per final message in review (20 rows: 51 calls, 12.8s at 240ms) | 13 calls in about 4 rounds, whatever the row count | `contactBlocks()` and `reviewsSent()` in `helpers/leadContactBlock.js`, `controller/lead/getLeadDetail.js` |
| Final message count pulled about 215 KB to return a number | About 18–20 KB | `pendingLeads(fields)` in `helpers/finalMessage.js`, `controller/lead/finalMessage.js` |
| No timing | Numbers-only log, off unless switched on | `helpers/leadTiming.js`, `index.js` |

## 4. Next job: caching

The owner decided this; the method below is a recommendation from the code and is not yet owner-approved. Present your plan and get a go-ahead before coding.

**Rule change:** earlier work forbade keeping finished responses. The comments in `useResource.js` and `pendingReads.js` still say so. The owner's caching decision replaces that rule, so update those comments in the same change.

**Recommended first step:** show the last data at once and refresh it behind the screen, in the browser's memory, inside `src/hooks/useResource.js` (the one data hook; Leads uses it through `useLeadResource`). Leave the backend alone at first.

Things that will break if missed:
1. **Accounts must never mix.** Key by `getResourceScope()` and the URL, and clear everything when `setResourceIdentity` changes the scope. The router keeps one account's screens from showing to the next, and the cache must do the same.
2. **Keep it in memory only.** Leads hold names and phone numbers, so do not write them to `localStorage` or `sessionStorage`.
3. **Forms must survive.** `onData(data, initial)` fills forms when `initial` is true. Refreshed data must not overwrite what someone is typing (`AdminSettingsPage`, `AdminMoneyManagementPage`, the lead follow-up form).
4. **Writes must refresh the cache.** Pages call `refresh()` after saving; a cached entry must update too. The live feed marks data stale through `usePortalUpdates` and `resourceDomains()`. `/admin/leads` has no entry in `resourceDomains()`, so Leads refreshes through `useLeadUpdates`.
5. **Stale data must never decide money or messages.** Payment, wallet and checkout must not act on cached amounts. Keep lead actions closed until fresh data arrives: `contactBlock` decides Send message. Do not cache `contactBlocks()` on the backend, because send paths rely on it.
6. **`loading` changes meaning.** Screens show a loader while `loading` is true. With cached data they should show the data with a small refresh sign instead, and an error must not hide it.

What caching will not fix: the first visit after a page refresh, and any new lead not yet opened. Those still pay the 1.8s, which is why the region question still matters.

## 5. Tests

| Run | What it proves |
|---|---|
| `cd frontend`, `npm run build`, `node tests/admin-navigation-browser.cjs` | Clicking between admin screens. Covers flash, reads per screen, scroll, logout, phone width |
| `node tests/portal-deploy-matrix.browser.cjs` | 38 routes and widths, draft survival, recovery |
| `CI=true npx react-scripts test --watchAll=false` | 63 Jest tests |
| `cd backend`, `node --test --test-concurrency=4 tests/*.test.js` | 579 tests (run on a copy without `.env`) |
| `E:\Allprojects\backup\backend\work46-lead-queries\audit-scripts` | Old vs new block rule (needs a copy with `helpers/leadContactBlock.old.js`), database calls with 240ms delay, live timing |

Known failure: `tests/offer-reservations-browser.cjs` already fails on the commit before this work.

In Playwright scroll tests click through the DOM: `.click()` scrolls first and hides a jump. These tests use fixture APIs. Real login and real data have only been checked by the owner.

## 6. Rules for this work

- Before editing, read `AGENTS.md`, and the installed Next docs for website code.
- Backups go in `E:\Allprojects\backup\<repo>\workNN`, never inside a repository. Latest: frontend `work47-sidebar-order`, backend `work46-lead-queries`, website `work67-speed-doc`.
- Tests use isolated data only: no real messages, charges or production data. Do not use owner servers on ports 3000, 3001 or 8080. Website `.env.local` points at production, so do not run Next against it.
- Keep financial, pricing, approval, refund, renewal, reservation and WhatsApp rules unchanged.
- The WhatsApp block rule stays in `contactBlocks()` alone. Phones are compared normalised, so it cannot be filtered per lead in the database. A review row with no draft keeps its old answer on purpose.
- The owner pushes and deploys, or approves it. Reply to the owner in Hinglish.

## 7. Separate, not part of this work

`GET /api/general-users` has no login check and, by its code, returns the names and emails of `role: "partner"` users. It was read in code, not called. The owner has been told and has not decided yet.

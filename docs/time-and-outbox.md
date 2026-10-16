# Time and Outbox source of truth

Verified against the website and E:/Allprojects/backend on 17 October 2026.

## Ownership and rules

- UTC instants remain unchanged in persistence and machine APIs. Human dates, times, calendar days and datetime-local inputs use Asia/Kolkata. Website conversions live in src/lib/date-time.ts; the independently deployed CommonJS backend uses helpers/dateTime.js for its mail/PDF output and IST query boundaries.
- The server clock owns timestamps and expiry decisions. Browser countdowns use an uncached server sample and elapsed monotonic time, with periodic/visibility resynchronization. They are approximate displays; backend validation remains authoritative.
- EmailHistory is the permanent mail ledger. EmailDraft is temporary content with a 23-hour TTL. No second Outbox collection or browser-computed totals.
- A mail is sent when the provider accepts it. sentAt records that backend event, never updatedAt or the website response time. Inbox delivery is not asserted.
- One draft equals one mail. Retries increment attempts, not mail counts. Recipient count is separately labelled. Existing sent rows without sentAt remain counted, with unknown time; no fabricated backfill.
- Outbox contains attempted mail (sending/sent/failed); pending/skipped reviews remain in history. Counts and pagination come from the backend, scoped by application and existing admin access. Date filters use IST calendar days and sentAt for sent records, lastAttemptAt for other attempts.

## Verified evidence

- src/app/admin/blog/blog-form.tsx parsed datetime-local in the device timezone.
- Date displays across public/admin pages mixed host/device timezone and explicit IST.
- src/app/admin/email-control/email-control-panel.tsx displayed updatedAt and only loaded 100 history rows.
- backend/models/emailControlModel.js already contains durable EmailHistory with sentAt/providerId and unique draftId.
- backend/helpers/emailController.js owns the sole Resend provider call and stable draft idempotency keys.
- Website Vercel cron is daily. Blog publishing is triggered on reads, throttled to one minute. Accurate IST scheduling/input is covered here; exact background publication requires a separate scheduler deployment and is not promised by this change.

## Implementation and verification

1. Shared time format/input utilities, migrate all website date output and schedule inputs.
2. Shared browser clock for offer countdowns/expiry and mail review display.
3. Extend existing mail ledger with attempt metadata; retain successful sending records through draft expiry. Return authoritative sentAt to subscription bookkeeping.
4. Add authorized backend Outbox query, database totals, search, IST ranges and pagination; expose through existing website proxy and management UI.
5. Verify multiple host/browser timezones, IST midnight and invalid inputs; real isolated MongoDB tests for send/retry/concurrency, ledger persistence, pagination, totals and access control; website type/lint/build and browser checks.

No live mail or production database is needed for verification. Deploy backend and website together; older records cannot prove events that were never recorded.

## Completed verification

- Website time utility tests: 2 passed (three host timezones, IST midnight, leap day, invalid input, end-of-minute conversion).
- Browser server clock test: passed in India, UTC and New York with the device clock overridden; two consumers share one sample.
- Backend email integration: 21 passed against disposable MongoDB, including database totals above 100 records, retries, concurrent sends, persistence and failure recovery.
- Website email integration/browser: 12 passed; Outbox search, IST output in a New York browser with a skewed clock, template details and authoritative subscription sentAt included.
- Website TypeScript check passed. Source lint passed with existing unused-variable warnings.
- Offer regression tests: 4 passed. Actual offer editor/API/browser workflow passed in New York timezone, including IST deadline round trip, live countdown and desktop/mobile layouts.
- Next.js production build passed, including the uncached dynamic /api/time route.

Run npm run test:time and npm run test:email in the website; npm run test:email in the backend. On slow Windows MongoDB startup, EMAIL_TEST_MONGO_TIMEOUT can raise the test-only launch timeout in milliseconds.

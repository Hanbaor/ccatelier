# Comment delivery reliability

This change is limited to the comments client. It does not connect a database, change deployment settings, or alter the Worker API.

## Verified contract

`worker/index.mjs` responds to POST `/api/comments` with HTTP 202, JSON `{id, status}`, and `application/json`. The ID is a UUID; status is `pending`, `approved`, or `rejected`. The latter two may be returned for an idempotent retry after moderation. GET returns HTTP 200 and `{items, total, next}`; each public item contains its ID, nickname, message, stamp, reply, and ISO timestamp.

The client checks this contract before acknowledging a delivery or rendering a list. HTML fallback, malformed JSON, missing or invalid receipt fields, wrong success status, and wrong content type cannot count as successful submission. Server error messages and the existing nine-second abort path remain available.

## Draft and retry behavior

- Failed delivery never clears the form. Feedback says the content remains in the current form and can be retried.
- Repeated submit gestures while delivery is pending issue one request.
- An unchanged retry reuses the original submission ID so the Worker can deduplicate uncertain outcomes.
- Editing a failed draft produces a fresh submission ID.
- A valid pending or approved receipt clears only the exact form snapshot submitted. Edits made while waiting, including whitespace, are preserved and identified as not yet submitted.
- A rejected receipt is described accurately as not public and leaves the content intact. An unchanged retry keeps its existing ID.
- There is no new persistent storage. Reloading or leaving the page is not guaranteed to retain a draft.

## Validation and limits

Run `node --test tests/community-interaction.test.cjs tests/community.test.cjs` for isolated DOM/client tests and the real Worker contract tests backed by an in-memory SQLite database. No real external comment is submitted by these tests.

The tests cover malformed replies, missing fields, network failure, abort feedback, HTTP 503, double submission, idempotent retry, changed drafts, late receipts, all moderation states, malformed list entries and recovery by retry. They mock an AbortError; they do not measure a real nine-second network timeout. Actual published browser and live service acceptance remain separate checks.

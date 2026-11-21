# What changed

## Security fixes (please read)
- **Rotate your Neon database password.** `backend/.env` in the zip you sent contained the live connection string. It is excluded from this package; create a new password in Neon and update your host's environment variables.
- Restricted *image* resources were streamable in full, without logging in, via `/resources/{id}/preview/file`. Fixed.
- Members-only preview text was exposed in the anonymous catalogue list. Fixed.
- The global error handler returned raw exception text to clients. Now only when `DEBUG=true`.
- Not changed, but worth fixing: `config.py` has a hardcoded fallback `JWT_SECRET_KEY`. If the env var is ever missing in production, anyone can forge tokens. Remove the default so the app refuses to start instead.

## Broken things fixed
- Admin verification page called service methods that don't exist and sent values the backend rejects, so no student could be approved. Fixed.
- Hardcoded demo practice questions (with correct answers shipped to the browser, graded client-side) removed.

## New
- Secure viewer: server-rendered, watermarked pages; raw downloads admin-only (`STUDENT_DOWNLOADS_ENABLED`).
- Offline reading: encrypted in-browser copies, expiring with the subscription, wiped on sign-out; app shell works offline via a service worker.
- Practice tests: question bank (manual + CSV), test configuration per course/materials/topics, server-graded timed attempts, results with explanations. Admin UI at /admin/assessments.

## Not verified here
I could not install the backend dependencies in my environment, so **the backend test suite was not run**. The page renderer was tested directly; the frontend type-checks for the new code. Please run `pytest` and `alembic upgrade head` before deploying.

## Still open (not touched)
- Prices are hardcoded in the frontend (₦300, ₦1,500, ₦2,000) but the backend package is ₦1,000, and there is no single-material purchase flow.
- Five older type errors remain (PricingPage, AdminAcademicPage, AdminResourcesPage); `vite build` does not catch them.
- Downloads from Vercel Blob storage use a local-file path and will fail; the viewer reads through the storage provider and is not affected.
- Access tokens last 20 minutes by default with no refresh; set `ACCESS_TOKEN_EXPIRE_MINUTES=720`.

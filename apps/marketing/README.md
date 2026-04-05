# Bird Code marketing site

Static Astro + React (shadcn/ui) landing site for Bird Code.

## Develop

Requires **Node.js ≥ 22.12** (see root `package.json` `engines`).

```bash
bun dev:marketing
```

Open `http://localhost:4173` (or `PORT`).

## Build

```bash
bun build:marketing
```

## Theme

Footer control cycles **light**, **system** (follows `prefers-color-scheme`), and **dark**. Preference is stored as `birdcode-marketing-theme` in `localStorage`. `BaseLayout.astro` includes an inline script that applies `html.dark` before paint to reduce FOUC. **`src/styles/global.css`** uses the same `--radius`, DM Sans + SF Mono, and `color-mix` surfaces as the web app, but **marketing primary and ring are neutral (monochrome)**—not the web app’s blue-violet accent. Tailwind maps semantic colors to `var(--token)` (see `tailwind.config.mjs`).

## Assets

Marketing pages use simplified Bird Code UI previews (`marketing-app-preview.tsx` and related components) instead of static screenshots. The repo ships `public/favicon.svg` from the web app icon.

## iOS waitlist (collecting emails)

The waitlist form POSTs JSON `{ "email": string }` to `PUBLIC_IOS_WAITLIST_ENDPOINT` when set (see `.env.example`).

**Typical setups:**

1. **Formspree / Getform / Basin** — Create a form, paste the POST URL, allow `application/json` if the provider supports it.
2. **Your own API** — e.g. a serverless route that validates email, stores in a DB or sends to Resend/SES, returns `200`.
3. **Google Forms** — Possible via Apps Script web app URL; usually easier to use a dedicated form service.

Copy `.env.example` to `.env` locally; for production hosting, set the env var in your host’s dashboard (Vercel, Netlify, etc.).

Without `PUBLIC_IOS_WAITLIST_ENDPOINT`, submit still shows a thank-you message (for local demos only).

## GitHub releases (stable + macOS downloads)

The site uses the **GitHub Releases API** for the Bird Code open-source repository (`src/lib/releases.ts`; GitHub slug unchanged for API compatibility).

**Stable downloads (hero + top of `/download`):**

1. Create a **normal** GitHub Release (not pre-release) with attached build artifacts.
2. Name assets so they end with `-arm64.dmg`, `-x64.dmg`, `-x64.exe`, `-x86_64.AppImage` (same pattern as your desktop CI).
3. The “latest” endpoint picks the newest **non-prerelease** release.

**Beta (unstable) on `/download`:**

1. Create a release and check **“Set as pre-release”** in GitHub.
2. Attach the same asset naming pattern. The page shows a **Beta (unstable) — macOS** card with those DMGs.
3. If there is no pre-release, the card explains that and links to all releases.

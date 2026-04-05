# Marketing site (`apps/marketing`)

- **Stack:** Astro 6, React 19, Tailwind 3, shadcn/ui (radix-nova), DM Sans (Google Fonts).
- **Pages:** `/`, `/features`, `/download`, `/ios-waitlist`.
- **Design tokens:** `src/styles/global.css` mirrors `apps/web/src/index.css` (primary `oklch(0.488 0.217 264)`, dark `oklch(0.588 0.217 264)`, same `--radius`, borders, destructive/info/success/warning). Marketing uses `color-mix` where the web app uses Tailwind v4 `--alpha()`.
- **UI:** Previews reuse class names aligned with `Sidebar`, `ChatHeader`, composer (`marketing-app-preview.tsx`) so the site reads as product chrome, not a generic landing template.
- **Copy:** Concrete, folder-scoped, provider-auth wording—no generic SaaS filler; meta titles/descriptions live on each page’s `BaseLayout` props.
- **Node:** Astro 6 requires Node ≥ 22.12 for `astro dev` / `astro build`.

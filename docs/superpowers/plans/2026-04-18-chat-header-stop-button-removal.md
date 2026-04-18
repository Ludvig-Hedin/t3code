# Chat Header Stop Button Removal

**Status:** completed

**Progress note:** The main chat header no longer renders the Stop generation button, and the `ChatHeader`/`ChatView` wiring was simplified to remove the unused interrupt props.

**Why this change:** Keep the header action row focused on persistent workspace controls and leave turn interruption to the composer, where the primary send/stop interaction already lives.

**Files touched:**

- `apps/web/src/components/chat/ChatHeader.tsx` — removed the conditional Stop button branch and the now-unused props/imports
- `apps/web/src/components/ChatView.tsx` — removed the no-longer-needed header props at both `ChatHeader` call sites

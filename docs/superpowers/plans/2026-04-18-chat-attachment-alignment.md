# Chat Attachment Alignment Fix — User Bubble Right Edge and Image Sizing

**Goal:** Make user-attached image thumbnails in the chat timeline read as part of the message bubble by pushing them further right and increasing their visual size slightly.

**Progress note:** The user attachment grid in `MessagesTimeline.tsx` now uses a right-aligned `w-fit` container with a wider max width, larger thumbnail chrome, and a slightly larger row-height estimate so virtualization stays in sync.

**Files in scope:**

- `apps/web/src/components/chat/MessagesTimeline.tsx` — Right-align the attachment grid and enlarge the thumbnail tiles
- `apps/web/src/components/timelineHeight.ts` — Increase the user attachment row height estimate
- `apps/web/src/components/timelineHeight.test.ts` — Update height expectations for the larger attachment chrome

# Notebase

A Milanote-style visual workspace for content creators and video editors. Notes, plans, images, videos, storyboards,
client jobs and video reviews on one infinite canvas — connect cards with arrows, plan posts on a calendar, and share
boards with clients or hand them to an AI.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

It works fully without the cloud; everything is then stored only in the browser you use.

## Features

**Canvas**

- Infinite canvas: pan, zoom (⌘/Ctrl + wheel, pinch on phones — anywhere, also over cards and text), minimap, box
  select (Shift + drag)
- Undo / redo buttons in the top bar (also ⌘Z / ⇧⌘Z): every change — text edits, moves, deletes, AI imports — can be
  taken back
- Cards: Note, List, Heading, Image, Video, Link, Scene (storyboard), Job (client, due date, fee, status), Color, Section,
  Board (boards inside boards)
- Arrows between cards, with labels and arrowheads (right-click a connection)
- Right-click menus for cards, connections and the canvas; on touch screens a selected card shows duplicate / delete / more
- Drag & drop or paste images, videos, links and text; moving a section moves the cards inside it
- Text formatting in notes, scenes and job notes: **bold** (⌘B), *italic* (⌘I), ~~strike~~, ==highlight== (⌘⇧H),
  colored text, big lines and bullets — click the text to get the formatting bar. Stored as plain text with markers
  (`**bold**`, `==highlight==`, `:red[text]`), so exports and AI tools still read it
- Rename any card's header (double-click it, e.g. "Scene 01" → "Hook"); scenes also have a title; text size S / M / L
  and colors from the right-click menu
- Background: dots, grid or plain · dark, light or system theme

**Video review**

- Timestamped comments on uploaded videos, YouTube and Vimeo — click a comment to jump to that moment
- Versions: upload V2, V3… on the same card; every version keeps its own comments
- Clients approve a version from the share link; the job card linked to the video (or the board's only job) moves to
  **Delivered** automatically
- Grab the paused frame of a video as an image card

**Planning**

- Content calendar (⌘⇧C): give any card a publish date and platform (right-click → _Schedule & tags…_); job due dates
  show up too. Drag entries to reschedule. Month and upcoming-list views.
- Tags: set them on a card or just write `#hashtags` in its text, then filter the board by tag from the top bar
- Jobs panel (⌘J): every job across all boards, sorted by due date, with overdue count and paid / awaiting payment totals
- Search (⌘K) across all boards, cards and tags

**Capture & export**

- Quick capture (Q, or the ⚡ button on phones): type or dictate an idea, add a photo or a link — it lands in your
  **Inbox** board. On Android you can also share links from other apps straight into Notebase.
- Extract a color palette from any image (right-click → _Extract color palette_)
- Export: the whole board as PNG, storyboard as PDF (scene cards with frames), a printable shot list, or Markdown
- Copy a board as structured text for Claude / ChatGPT

**Work with AI (A)**

1. Press **AI** in the top bar, pick or type a request ("Turn this idea into a 6–8 shot storyboard") and **Copy board +
   request**. The text includes the whole board plus a short guide telling the AI how to answer with a `notebase` block.
2. Paste it into Claude, ChatGPT or any assistant and talk the idea through.
3. Copy the AI's reply and paste it onto the canvas (⌘V) — or into the AI dialog — and it becomes real cards: scenes with
   shot type, length, sound and image prompts, notes, lists, colors, links and jobs, connected with arrows and grouped in a
   section. One ⌘Z removes the whole import.

The `notebase` block format is documented in [`src/ai/importer.ts`](src/ai/importer.ts) (`AI_GUIDE`); the AI reading link
(`/s/<id>`) includes the same guide.

**Sync & sharing**

- Cloud sync: sign in and your boards, images and videos are the same on every device; works offline and catches up later
- Share links: a client view (read-only canvas with video comments and approvals) and an AI / reading page that renders
  the whole board as plain HTML or Markdown
- Installable app (PWA) with offline support; it updates itself when a new version is deployed

## Connecting the cloud (once, ~5 minutes)

The cloud uses a free [Supabase](https://supabase.com) project.

1. **supabase.com** → _Start your project_ → sign in with GitHub → **New project**. Pick any name and database password,
   region e.g. _Central EU (Frankfurt)_.
2. In the project, open **SQL Editor** → _New query_ → paste all of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   It is safe to run again; **run it again after updating Notebase** so new features (versions, approvals, inbox) get
   their columns.
3. **Authentication → Sign In / Providers → User Signups**: turn **Confirm email** off and save.
4. Copy the **Project URL** and the **anon / publishable key** (the green **Connect** button shows both).
5. In **Vercel** → your project → **Settings → Environment Variables**, add:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` (or `VITE_SUPABASE_PUBLISHABLE_KEY`) = the key

   Then **Deployments** → latest → **⋯ → Redeploy**.
6. Open the site → **Cloud sync** (bottom left) → **Create account**.
7. Afterwards turn **Allow new users to sign up** off in Supabase so nobody else can create an account.

Using Vercel's Supabase integration instead also works — the app reads the `NEXT_PUBLIC_SUPABASE_…` variables it adds.
Steps 2 and 3 are still needed.

**Free plan limits:** 50 MB per file and 1 GB of storage. Larger videos stay on the device they were added on; for long
videos an unlisted YouTube or Vimeo link works best. Free projects pause after a week without use and can be resumed in
one click from the Supabase dashboard.

**Privacy:** boards are readable only with your account. A share link exposes that board and its sub-boards to anyone with
the link until you turn sharing off. Uploaded images and videos have unguessable but public addresses — that is what lets
share links and AI tools load them.

## Share links

| Link | What it is |
| --- | --- |
| `/?share=<id>` | Client view: the canvas, read-only, with video comments and approvals |
| `/s/<id>` | Server-rendered page: people, link previews and AI tools can read it without JavaScript |
| `/s/<id>/md` | The same as Markdown |
| `/s/<id>/json` | Raw data |

## Shortcuts

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| N | Note | S | Scene |
| L | List | J | Job |
| H | Heading | C | Color |
| I | Image | F | Section |
| V | Video | B | Board |
| K | Link | Q | Quick capture |
| ⌘K | Search | ⌘J | Jobs |
| ⌘⇧C | Calendar | Double-click | New note |
| ⌘Z / ⇧⌘Z | Undo / redo | ⌘D | Duplicate |
| A | Work with AI | ⌫ / Delete | Delete selection |
| Right-click | Menu | | |

## Tech

React + TypeScript + Vite, [React Flow](https://reactflow.dev) (canvas), Zustand (state), IndexedDB (on-device storage),
Supabase (accounts, database, files), a Vercel Edge Function (`api/share.ts`, the share page), html-to-image (PNG export).

Sync is offline-first: the app always reads from the device, and changes go to the cloud in the background. Each board is
one row and the most recent save wins — if the same board is edited on two devices at the same moment, the later save wins.

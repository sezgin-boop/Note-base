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
- A selected card shows a **Move** handle underneath: drag it to move the card straight away (on phones too)
- On phones, press and hold any card (even over its text) for a moment to lift it, then drag it — it follows your finger,
  the board scrolls at the screen edges, sections carry their cards and photos drop into scene frames; a quick swipe
  still scrolls and a tap still edits
- Right-click menus for cards, connections and the canvas; on touch screens a selected card shows duplicate / delete / more
- Draw (✏️ in the toolbar, or P): pen, highlighter, line, arrow, rectangle, ellipse, text and eraser, in 8 colors and 3
  sizes — over cards too. Shift snaps lines to 15° and shapes to squares / circles. Drawings are cards: move, resize,
  recolor (right-click), delete and undo them; they sync like everything else
- Drag & drop or paste images, videos, links and text; moving a section moves the cards inside it
- Drop a picture onto a scene's frame (or an empty image card) to put it there — a file from your computer, a picture
  from a website, or an image card already on the board (it moves into the frame)
- Collapsible sections: the ▾ button (or Enter on a selected section) folds a section into a compact bar showing its
  icon, title, what's inside (card counts, to-do progress, picture previews); open it again with ▸ or a double-click.
  Right-click a section for its icon, color and style (Tint, Solid, Outline, Dashed), or the canvas for _Collapse /
  Expand all sections_. A folded bar can be moved with everything in it; search opens it when a hit is inside
- Text formatting in notes, scenes and job notes: **bold** (⌘B), *italic* (⌘I), ~~strike~~, ==highlight== (⌘⇧H),
  colored text, big lines and bullets — click the text to get the formatting bar. Stored as plain text with markers
  (`**bold**`, `==highlight==`, `:red[text]`), so exports and AI tools still read it
- Rename any card's header (double-click it, e.g. "Scene 01" → "Hook"); scenes also have a title; text size (XS – XXL)
  and colors from the right-click menu, or A− / A+ in the formatting bar while writing
- Notes and lists resize in every direction (drag a corner or edge; they never cut off their text and still grow as
  you type); drag a heading's corner to make the heading bigger or smaller
- Dictation apps (Wispr Flow, the keyboard's mic…) work in notes: switching to them keeps the note open for typing, and
  text pasted while a note is selected goes into that note
- Card styles (🖌 on a selected card, or right-click → _Card style…_): change a card's whole look — 19 designed styles
  (Paper, Notebook, Kraft, Holo, Sunset, Aurora, Blueprint, Film grain…), your own color or gradient, or a picture as
  the background with shade and blur. Text switches to light or dark ink automatically. Apply a style to every card of
  that kind, or copy and paste it between cards. Works for notes, lists, scenes, jobs, links, videos and sections
- Background: dots, grid or plain · dark, light or system theme

**Video review**

- Timestamped comments on uploaded videos, YouTube and Vimeo — click a comment to jump to that moment
- Versions: upload V2, V3… on the same card; every version keeps its own comments
- Clients can **mark up** a shared board (pen, arrows, shapes, text notes) and send it; you see their marks with their
  name and keep them as drawings or clear them (run `supabase/schema.sql` again once to allow this)
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

- Full-screen photos zoom inside the viewer (pinch, double-tap, mouse wheel, ＋ / −) and pan; swipe or use the arrows
  to flip through a gallery. The page itself never zooms, so the app's bars always stay on screen
- Photo galleries: an image card or a scene frame holds several photos — pick many at once, add more with ＋, or drop
  photos (or another image card) onto it — and flips through them with the arrows, the dots or ← / →. Several files
  dropped on empty board space line up in a grid
- Templates (＋ next to Boards → _All templates…_, or right-click the board → _Template…_): Reels / TikTok script,
  YouTube video, video production, brand deal, client job, photo / video shoot, content pipeline, idea bank and
  moodboard — as a new board or added to the open one
- Install as an app (Safari → Share → Add to Home Screen; Chrome → Install): full screen with launch screens for
  every iPhone / iPad size, bars kept clear of the notch and home bar; Safari on iPhone shows a small "Get the app"
  hint (at most once a week)
- Save from your phone (sidebar → _Save from your phone_): share a link, text or photo from any app into the Inbox.
  Android: the installed app is in the share menu. iPhone: a Shortcut posts to a personal link (`/api/capture`,
  needs cloud sync and `SUPABASE_SERVICE_ROLE_KEY`); making a new link switches the old one off
- Dictation apps (Wispr Flow…) keep working when they take the focus away for a moment: the field stays open, takes the
  focus back and picks up text written while the page was in the background
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

**Claude connector**

Add Notebase to Claude as a connector and Claude can work on your boards directly: read them, build storyboards,
add notes, lists and jobs, put photos and videos from the web on a board, edit or delete cards and create boards. See
[Claude connector](#claude-connector) below.

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

## Claude connector

Notebase includes a remote MCP server (`/mcp`), so Claude (claude.ai, the desktop and mobile apps, Claude Code) can use
your boards as a connector. It needs the cloud set up first.

**Set up (once)**

1. Supabase → **Project Settings → API Keys** → copy the **secret** key (`sb_secret_…`; on older projects the
   _service_role_ key under _Legacy API keys_).
2. Vercel → your project → **Settings → Environment Variables** → add `SUPABASE_SERVICE_ROLE_KEY` = that key.
   **Never** give it a `VITE_` or `NEXT_PUBLIC_` prefix — those end up in the public website. Then redeploy.
3. Claude → **Settings → Connectors → Add custom connector**. Name: `Notebase`, URL: `https://<your-site>/mcp`
   (e.g. `https://note-base-wine.vercel.app/mcp`) → **Add** → **Connect**, and sign in with your Notebase email and password.

**Use it** — just ask, for example:

- "Look at my Night drive board and turn the idea into an 8-shot storyboard on it."
- "Make a moodboard board with these 6 photos: <links>"
- "What did the client comment on V2 of the brand film? Make a to-do list from it."
- "Mark the Acme job as delivered."

Changes show up in the app within about 30 seconds; Claude also gives you a link that opens the board.

What it can do: `list_boards`, `read_board`, `search`, `add_cards`, `add_media` (images and videos from links are copied
into your storage; YouTube / Vimeo become video cards; other pages become link cards), `update_card`, `delete_cards`,
`create_board`, `get_upload_link`.

**Photos from the chat:** Claude can't hand files from a chat to a connector, so `get_upload_link` makes a link (valid
an hour) for one board. Claude's code sandbox can upload the files to it directly when it is allowed to reach your site
(Claude → Settings → Capabilities → code execution network access); otherwise Claude gives you the link — open it, pick
the photos or videos (up to 50 MB each) and they appear on the board, laid out together.

**Security:** signing in only works for Claude's own addresses, and every action is limited to your account. Removing the
connector in Claude disconnects it; to cut off every connected app at once, create a new secret key in Supabase, put it
in Vercel and delete the old one.

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
| Right-click | Menu | ↵ | Fold / unfold selected section |

## Tech

React + TypeScript + Vite, [React Flow](https://reactflow.dev) (canvas), Zustand (state), IndexedDB (on-device storage),
Supabase (accounts, database, files), Vercel Edge Functions (`api/share.ts` the share page, `api/mcp.ts` + `api/oauth-*.ts`
the Claude connector, with shared code in `server/`), html-to-image (PNG export).

Sync is offline-first: the app always reads from the device, and changes go to the cloud in the background. Each board is
one row and the most recent save wins — if the same board is edited on two devices at the same moment, the later save wins.

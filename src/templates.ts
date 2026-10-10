import { nanoid } from 'nanoid';
import { makeCard } from './cards';
import type { BoardContent, CardData, CardEdge, CardNode, CardType } from './types';

export type TemplateId = 'welcome' | 'video' | 'calendar' | 'moodboard' | 'client';

export const TEMPLATES: { id: Exclude<TemplateId, 'welcome'>; name: string; icon: string; desc: string }[] = [
  { id: 'video', name: 'Video production', icon: '🎬', desc: 'Idea → script → storyboard → edit' },
  { id: 'calendar', name: 'Content pipeline', icon: '🗓️', desc: 'Ideas, to shoot, editing, published' },
  { id: 'moodboard', name: 'Moodboard', icon: '🎨', desc: 'Palette, references, typography' },
  { id: 'client', name: 'Client job', icon: '💼', desc: 'Brief, deliverables, revisions' },
];

const card = (type: CardType, x: number, y: number, data?: CardData, size?: { width?: number; height?: number }) => {
  const n = makeCard(type, { x, y }, data);
  return size ? { ...n, ...size } : n;
};

const wire = (a: CardNode, b: CardNode, from = 'r', to = 'l'): CardEdge => ({
  id: nanoid(10),
  source: a.id,
  target: b.id,
  sourceHandle: from,
  targetHandle: to,
});

const todos = (...texts: string[]) => texts.map((text) => ({ id: nanoid(6), text, done: false }));
const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

function welcome(): BoardContent {
  const head = card('heading', 0, 0, { text: 'Welcome 👋' }, { width: 520 });
  const intro = card(
    'note',
    0,
    90,
    {
      color: '#a78bfa',
      title: 'How Notebase works',
      text:
        'This is an infinite canvas. Put your notes, plans, images and videos wherever you like.\n\n' +
        '• Add cards from the toolbar below, or double-click the canvas\n' +
        '• Drag & drop or paste (⌘V) images, videos and links\n' +
        '• Drag from the dots on a card’s edge to connect it to another card\n' +
        '• Double-click a board card to go inside — boards can hold boards\n' +
        '• Right-click anything for more options\n' +
        '• Write hashtags like #idea in notes, then filter by them from the top bar\n' +
        '• ⌘K searches every board, ⌘Z / ⇧⌘Z undo / redo',
    },
    { width: 340 },
  );
  const sample = card('board', 475, 70, {});
  const today = card('todo', 420, 250, {
    title: 'Today',
    items: todos('Look around the sample board', 'Add your first note', 'Drop in a reference image'),
  });
  const job = card('project', 740, 90, {
    title: 'Brand film',
    client: 'Sample Client',
    deadline: inDays(9),
    fee: '$2,500',
    status: 'edit',
    text: '60s vertical + 16:9 cut',
  });
  return { nodes: [head, intro, sample, today, job], edges: [wire(intro, sample), wire(sample, job)] };
}

function video(): BoardContent {
  const f1 = card('frame', 0, 0, { title: '1 · Idea & brief', color: '#a78bfa' }, { width: 600, height: 400 });
  const idea = card('note', 24, 60, {
    title: 'Video idea',
    text: 'In one sentence: what does this video promise the viewer?\n\nFormat: YouTube (16:9) + 3 Shorts #idea',
  });
  const hook = card('note', 310, 60, {
    color: '#f59e0b',
    title: 'Hook (first 3s)',
    text: 'Option A: open with the result\nOption B: ask a question\nOption C: unexpected shot #hook',
  });
  const audience = card('note', 24, 250, { title: 'Audience', text: 'Who is this for? Why now?' }, { width: 550 });

  const f2 = card('frame', 680, 0, { title: '2 · Script', color: '#38bdf8' }, { width: 340, height: 400 });
  const script = card(
    'note',
    704,
    60,
    {
      title: 'Outline',
      text: '00:00 Hook\n00:05 Intro / context\n00:30 Part 1\n02:00 Part 2\n04:00 Wrap-up\n04:30 CTA — subscribe / comment',
    },
    { width: 290 },
  );

  const f3 = card('frame', 0, 480, { title: '3 · Storyboard', color: '#34d399' }, { width: 900, height: 330 });
  const s1 = card('scene', 24, 540, {
    number: 1,
    shot: 'Close-up',
    duration: '3s',
    text: 'Hook — tight on face, straight to camera',
    audio: 'VO + whoosh',
  });
  const s2 = card('scene', 314, 540, {
    number: 2,
    shot: 'Wide',
    duration: '8s',
    text: 'Establishing shot of the location',
    audio: 'Music comes in',
  });
  const s3 = card('scene', 604, 540, {
    number: 3,
    shot: 'B-roll',
    duration: '12s',
    text: 'Detail shots: hands, gear, process',
    audio: 'Music',
  });

  const f4 = card('frame', 980, 480, { title: '4 · Moodboard', color: '#f472b6' }, { width: 480, height: 330 });
  const c1 = card('color', 1004, 540, { hex: '#0f172a', title: 'Night blue' });
  const c2 = card('color', 1154, 540, { hex: '#f59e0b', title: 'Warm accent' });
  const c3 = card('color', 1304, 540, { hex: '#e2e8f0', title: 'Off-white' });
  const moodNote = card('note', 1004, 690, { text: 'Drop reference images and videos here ↓' }, { width: 430 });

  const shoot = card('todo', 1100, 0, {
    title: '🎥 Shot list',
    items: todos('Camera + 2 batteries', 'Lav mic', 'Lights (key + fill)', 'Empty memory cards', 'B-roll list'),
  });
  const post = card('todo', 1400, 0, {
    title: '✂️ Edit & deliver',
    items: todos(
      'Rough cut',
      'Audio cleanup + music',
      'Color grade',
      'Subtitles',
      'Thumbnail',
      'Title, description, tags',
      'Upload & schedule',
    ),
  });

  return {
    nodes: [f1, f2, f3, f4, idea, hook, audience, script, s1, s2, s3, c1, c2, c3, moodNote, shoot, post],
    edges: [wire(idea, hook), wire(hook, script), wire(s1, s2), wire(s2, s3), wire(script, shoot), wire(shoot, post)],
  };
}

function calendar(): BoardContent {
  const cols: [string, string, [string, string, number | null][]][] = [
    [
      '💡 Ideas',
      '#a1a1aa',
      [
        ['Behind the scenes vlog', 'YouTube', null],
        ['Gear tour', 'YouTube', null],
        ['5 editing shortcuts', 'Reels', null],
      ],
    ],
    ['🎥 To shoot', '#f59e0b', [['Weekly vlog #12', 'YouTube', 6]]],
    ['✂️ Editing', '#a78bfa', [['Client BTS reel', 'Reels', 3]]],
    ['🚀 Published', '#34d399', [['Color grading guide', 'YouTube', -2]]],
  ];
  const nodes: CardNode[] = [card('heading', 0, -90, { text: 'Content pipeline' })];
  cols.forEach(([title, color, items], i) => {
    const x = i * 320;
    nodes.push(card('frame', x, 0, { title, color }, { width: 300, height: 640 }));
    items.forEach(([text, platform, days], j) =>
      nodes.push(
        card('note', x + 20, 60 + j * 130, {
          title: text,
          text: 'Hook:\nNotes:',
          platform,
          ...(days !== null ? { publishDate: inDays(days) } : {}),
        }),
      ),
    );
  });
  return { nodes, edges: [] };
}

function moodboard(): BoardContent {
  const nodes: CardNode[] = [card('heading', 0, -90, { text: 'Moodboard' })];
  ['#0b0b0f', '#1e293b', '#a78bfa', '#f472b6', '#fde68a'].forEach((hex, i) =>
    nodes.push(card('color', i * 160, 0, { hex, title: hex.toUpperCase() })),
  );
  nodes.push(card('frame', 0, 180, { title: 'Visual references' }, { width: 780, height: 440 }));
  nodes.push(card('note', 840, 0, { title: 'Typography', text: 'Headings:\nBody:' }));
  nodes.push(card('note', 840, 180, { title: 'Music / sound', text: 'Tempo, genre, reference tracks' }));
  nodes.push(card('note', 840, 360, { title: 'Feeling', text: 'Cinematic · calm · night · neon' }));
  return { nodes, edges: [] };
}

function client(): BoardContent {
  const job = card('project', 0, 0, {
    title: 'Project name',
    client: 'Client',
    deadline: inDays(14),
    fee: '',
    status: 'brief',
    text: '',
  });
  const brief = card(
    'note',
    360,
    0,
    {
      color: '#38bdf8',
      title: 'Brief',
      text: 'Goal:\nAudience:\nKey message:\nFormat / length:\nReferences:',
    },
    { width: 300 },
  );
  const deliver = card('todo', 720, 0, {
    title: 'Deliverables',
    items: todos('16:9 master', '9:16 reels / shorts', '1:1 cutdown', 'Subtitled version', 'Project files'),
  });
  const rev = card('frame', 0, 300, { title: 'Revisions', color: '#f87171' }, { width: 660, height: 300 });
  const r1 = card('note', 24, 360, { title: 'V1 feedback', text: '' });
  const r2 = card('note', 310, 360, { title: 'V2 feedback', text: '' });
  const contact = card('note', 720, 300, { title: 'Contact', text: 'Name:\nEmail:\nPhone:' });
  return { nodes: [job, brief, deliver, rev, r1, r2, contact], edges: [wire(job, brief), wire(brief, deliver), wire(r1, r2)] };
}

export function buildTemplate(id: TemplateId): BoardContent {
  return { welcome, video, calendar, moodboard, client }[id]();
}

import { nanoid } from 'nanoid';
import { makeCard } from './cards';
import type { BoardContent, CardData, CardEdge, CardNode, CardType } from './types';

export type TemplateId =
  | 'welcome'
  | 'reels'
  | 'youtube'
  | 'video'
  | 'brand'
  | 'client'
  | 'calendar'
  | 'ideas'
  | 'shoot'
  | 'moodboard';

export interface TemplateInfo {
  id: Exclude<TemplateId, 'welcome'>;
  name: string;
  icon: string;
  desc: string;
  /** What's on it, shown in the template gallery. */
  inside: string[];
  group: 'Create' | 'Work' | 'Plan';
}

export const TEMPLATES: TemplateInfo[] = [
  {
    id: 'reels',
    name: 'Reels / TikTok script',
    icon: '📱',
    desc: 'Hook options, a 30-second beat-by-beat script, caption and a posting checklist',
    inside: [
      '3 hook styles',
      '5 scenes: hook → problem → value → proof → CTA',
      'On-screen text',
      'Caption & hashtags',
      'Before-posting checklist',
    ],
    group: 'Create',
  },
  {
    id: 'youtube',
    name: 'YouTube video',
    icon: '▶️',
    desc: 'Title & thumbnail ideas, intro, chapters, outro, description and SEO',
    inside: ['Title ideas', '2 thumbnail slots', 'Intro, chapters, outro', 'Description & SEO checklist', 'Production steps'],
    group: 'Create',
  },
  {
    id: 'video',
    name: 'Video production',
    icon: '🎬',
    desc: 'Idea → script → storyboard → moodboard → edit',
    inside: ['Idea & hook', 'Outline', '3-scene storyboard', 'Colors', 'Shot list & edit checklist'],
    group: 'Create',
  },
  {
    id: 'brand',
    name: 'Brand deal',
    icon: '🤝',
    desc: "A sponsorship from brief to report: talking points, do's & don'ts, contract, timeline",
    inside: [
      'Job card with deadline & fee',
      "Brand brief, do's & don'ts",
      'Deliverables & timeline',
      'Contract & usage rights',
      'Draft feedback',
    ],
    group: 'Work',
  },
  {
    id: 'client',
    name: 'Client job',
    icon: '💼',
    desc: 'Brief, deliverables, revisions, contact',
    inside: ['Job card', 'Brief', 'Deliverables', 'Revision rounds', 'Contact'],
    group: 'Work',
  },
  {
    id: 'shoot',
    name: 'Photo / video shoot',
    icon: '📸',
    desc: 'Concept, shot list, location & call times, people, gear and references',
    inside: ['Concept', 'Shot list', 'Location & time', 'Team', 'Gear checklist', 'Reference area'],
    group: 'Work',
  },
  {
    id: 'calendar',
    name: 'Content pipeline',
    icon: '🗓️',
    desc: 'Ideas, to shoot, editing, published',
    inside: ['4 columns', 'Sample posts with platforms and dates'],
    group: 'Plan',
  },
  {
    id: 'ideas',
    name: 'Idea bank',
    icon: '💡',
    desc: 'Hooks that worked, video ideas, series formats and trends to try',
    inside: ['Hook bank', 'Video ideas', 'Series / formats', 'Trends to try'],
    group: 'Plan',
  },
  {
    id: 'moodboard',
    name: 'Moodboard',
    icon: '🎨',
    desc: 'Palette, references, typography',
    inside: ['5 colors', 'Reference area', 'Typography, sound, feeling'],
    group: 'Plan',
  },
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
  const f1 = card('frame', 0, 0, { title: '1 · Idea & brief', color: '#a78bfa' }, { width: 600, height: 420 });
  const idea = card('note', 24, 60, {
    title: 'Video idea',
    text: 'In one sentence: what does this video promise the viewer?\n\nFormat: YouTube (16:9) + 3 Shorts #idea',
  });
  const hook = card('note', 310, 60, {
    color: '#f59e0b',
    title: 'Hook (first 3s)',
    text: 'Option A: open with the result\nOption B: ask a question\nOption C: unexpected shot #hook',
  });
  const audience = card('note', 24, 290, { title: 'Audience', text: 'Who is this for? Why now?' }, { width: 550 });

  const f2 = card('frame', 680, 0, { title: '2 · Script', color: '#38bdf8' }, { width: 340, height: 420 });
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

function reels(): BoardContent {
  const head = card('heading', 0, -110, { text: 'Reel: your topic' }, { width: 640 });
  const concept = card(
    'note',
    0,
    0,
    {
      color: '#e879f9',
      title: 'Concept',
      text: 'In one sentence: what does the viewer get?\n\nLength: 30–45s · 9:16\nTrend / audio:\n#idea',
      platform: 'Reels',
      publishDate: inDays(3),
    },
    { width: 300 },
  );
  const fHooks = card('frame', 340, 0, { title: 'Hooks — pick one', color: '#f59e0b', icon: '🪝' }, { width: 900, height: 240 });
  const hooks = [
    ['Bold claim', '"Stop doing X. Do this instead."'],
    ['Question', '"Why does nobody talk about…?"'],
    ['Visual surprise', 'Open on the most striking shot, explain after.'],
  ].map(([title, text], i) => card('note', 364 + i * 290, 56, { title, text: `${text}\n#hook` }, { width: 270 }));

  const fScript = card(
    'frame',
    0,
    300,
    { title: 'Script — beat by beat', color: '#34d399', icon: '🎬' },
    { width: 1480, height: 400 },
  );
  const beats: [string, string, string, string][] = [
    ['Close-up', '0–3s', 'HOOK — say the hook straight to camera', 'Trending audio starts'],
    ['Medium', '3–8s', 'PROBLEM — the pain your viewer knows', 'VO'],
    ['B-roll', '8–20s', 'VALUE — 3 quick tips, one per cut', 'VO + on-screen text'],
    ['Insert', '20–27s', 'PROOF — result, before / after, numbers', 'Beat drop'],
    ['Close-up', '27–30s', 'CTA — save, follow, or comment a word', 'VO'],
  ];
  const scenes = beats.map(([shot, duration, text, audio], i) =>
    card('scene', 24 + i * 290, 356, { number: i + 1, shot, duration, text, audio }),
  );

  const onScreen = card('note', 0, 760, { title: 'On-screen text', text: '1. \n2. \n3. ' });
  const caption = card(
    'note',
    290,
    760,
    {
      title: 'Caption & hashtags',
      text: 'First line = a second hook\n\n2–3 short lines of value\n\nCTA: "Save this for later"\n\n#niche #topic #series',
    },
    { width: 320 },
  );
  const shots = card('todo', 640, 760, {
    title: '🎥 Shot list',
    items: todos('Hook — 3 takes', 'B-roll for each tip', 'Proof shot / screen recording', 'CTA take'),
  });
  const post = card('todo', 930, 760, {
    title: '🚀 Before posting',
    items: todos(
      'Cover frame with big text',
      'Subtitles checked',
      'Audio level / trending sound',
      'Caption + hashtags',
      'Post at your best time',
      'Reply to comments in the first hour',
    ),
  });
  const edges = [wire(concept, fHooks), ...scenes.slice(1).map((sc, i) => wire(scenes[i], sc))];
  return { nodes: [fHooks, fScript, head, concept, ...hooks, ...scenes, onScreen, caption, shots, post], edges };
}

function youtube(): BoardContent {
  const head = card('heading', 0, -110, { text: 'YouTube: working title' }, { width: 700 });
  const fPack = card(
    'frame',
    0,
    0,
    { title: 'Packaging — title & thumbnail', color: '#f87171', icon: '🖼️' },
    { width: 960, height: 320 },
  );
  const titles = card(
    'note',
    24,
    56,
    {
      title: 'Title ideas',
      text: '1. \n2. \n3. \n\nUnder ~60 characters · a clear promise + curiosity',
      platform: 'YouTube',
      publishDate: inDays(7),
    },
    { width: 300 },
  );
  const thumbA = card('image', 350, 56, { caption: 'Thumbnail A' });
  const thumbB = card('image', 650, 56, { caption: 'Thumbnail B' });

  const fScript = card('frame', 0, 380, { title: 'Script', color: '#38bdf8', icon: '📝' }, { width: 960, height: 330 });
  const intro = card('note', 24, 436, { title: 'Intro (first 30s)', text: 'Hook:\nWhat they will get:\nWhy trust me:\n#hook' });
  const chapters = card('note', 314, 436, {
    title: 'Chapters',
    text: '00:00 Intro\n01:00 \n03:00 \n06:00 \n08:00 Wrap-up',
  });
  const outro = card('note', 604, 436, {
    title: 'Outro',
    text: 'Recap in one line\nNext video to watch:\nCTA: subscribe / comment',
  });

  const seo = card('todo', 1020, 0, {
    title: '🔎 Description & SEO',
    items: todos(
      'Description — the first 2 lines matter',
      'Chapters in the description',
      'Links & sponsor / affiliate disclosure',
      'Keywords in title and description',
      'End screen + cards',
      'Add to a playlist',
    ),
  });
  const prod = card('todo', 1020, 380, {
    title: '🎬 Production',
    items: todos('Script final', 'Shoot A-roll', 'B-roll', 'Edit + music', 'Thumbnail', 'Upload & schedule'),
  });
  return {
    nodes: [fPack, fScript, head, titles, thumbA, thumbB, intro, chapters, outro, seo, prod],
    edges: [wire(intro, chapters), wire(chapters, outro)],
  };
}

function brand(): BoardContent {
  const job = card('project', 0, 0, {
    title: 'Brand × You — campaign',
    client: 'Brand name',
    deadline: inDays(21),
    fee: '',
    status: 'brief',
    text: 'Deliverables: 1 Reel + 3 Stories',
  });
  const brief = card(
    'note',
    340,
    0,
    {
      color: '#38bdf8',
      title: 'Brief from the brand',
      text: 'Product:\nKey message:\nTarget audience:\nMust say / must show:\nLink / discount code:\nHashtags & tags:',
    },
    { width: 300 },
  );
  const rules = card('note', 680, 0, { title: "Do's & don'ts", text: "✅ Do:\n- \n\n❌ Don't:\n- " });
  const points = card('note', 680, 250, { title: 'Talking points (in your words)', text: '1. \n2. \n3. ' });
  const deliver = card('todo', 0, 300, {
    title: '📦 Deliverables',
    items: todos('1× Reel (9:16)', '3× Stories with link sticker', 'Raw footage (if in the contract)'),
  });
  const timeline = card('todo', 340, 300, {
    title: '🗓️ Timeline',
    items: todos(
      'Contract signed',
      'Concept / script sent',
      'Draft sent for approval',
      'Approved',
      'Posted',
      'Report sent (reach, views, clicks)',
      'Invoice paid',
    ),
  });
  const money = card(
    'note',
    0,
    580,
    {
      color: '#34d399',
      title: 'Contract & money',
      text: 'Fee:\nUsage rights (where, how long):\nExclusivity:\nPayment terms:\nInvoice number:',
    },
    { width: 300 },
  );
  const fDrafts = card(
    'frame',
    340,
    600,
    { title: 'Drafts & feedback', color: '#f87171', icon: '🔁' },
    { width: 600, height: 280 },
  );
  const v1 = card('note', 364, 656, { title: 'V1 feedback', text: '' });
  const v2 = card('note', 654, 656, { title: 'V2 feedback', text: '' });
  return {
    nodes: [fDrafts, job, brief, rules, points, deliver, timeline, money, v1, v2],
    edges: [wire(job, brief), wire(brief, rules), wire(v1, v2)],
  };
}

function shoot(): BoardContent {
  const head = card('heading', 0, -110, { text: 'Shoot: name / date' }, { width: 600 });
  const concept = card(
    'note',
    0,
    0,
    { color: '#f59e0b', title: 'Concept', text: 'Story / feeling in one line:\nFormat: photo · video · both\nDelivery: ' },
    { width: 300 },
  );
  const where = card('note', 0, 220, {
    title: '📍 Location & time',
    text: 'Address:\nCall time:\nGolden hour / sunset:\nPermits:\nPlan B if it rains:',
  });
  const team = card('note', 0, 450, { title: '👥 Team', text: 'Model / talent:\nMUA / styling:\nAssistant:\nPhone numbers:' });
  const shots = card('todo', 340, 0, {
    title: '📋 Shot list',
    items: todos('Wide establishing', 'Portrait — close', 'Detail / product', 'Movement / walking shot', 'Behind the scenes'),
  });
  const gear = card('todo', 340, 330, {
    title: '🎒 Gear',
    items: todos('Camera + charged batteries', 'Lenses', 'Empty memory cards', 'Light / reflector', 'Tripod / gimbal', 'Mic'),
  });
  const fRefs = card('frame', 660, 0, { title: 'References', color: '#f472b6', icon: '🎨' }, { width: 640, height: 520 });
  const drop = card('note', 684, 56, { text: 'Drop reference photos and videos here ↓' }, { width: 590 });
  return { nodes: [fRefs, head, concept, where, team, shots, gear, drop], edges: [wire(concept, shots)] };
}

function ideas(): BoardContent {
  const head = card('heading', 0, -110, { text: 'Idea bank' }, { width: 500 });
  const cols: [string, string, string, [string, string][]][] = [
    [
      'Hooks that worked',
      '#f59e0b',
      '🪝',
      [
        ['"I tried X for 30 days"', 'Why it worked: clear stakes + time frame #hook'],
        ['"You are doing X wrong"', 'Why it worked: calls out the viewer #hook'],
      ],
    ],
    [
      'Video ideas',
      '#a78bfa',
      '💡',
      [
        ['Behind the scenes of my setup', '#idea'],
        ['3 mistakes beginners make', '#idea'],
      ],
    ],
    [
      'Series / formats',
      '#38bdf8',
      '🔁',
      [
        ['Weekly: tool of the week', 'Same intro, same length, same day'],
        ['Before / after', 'Split screen, one result per episode'],
      ],
    ],
    ['Trends to try', '#34d399', '📈', [['Trending sound:', 'Link:\nMy twist:']]],
  ];
  const nodes: CardNode[] = [head];
  cols.forEach(([title, color, icon, items], i) => {
    const x = i * 320;
    nodes.unshift(card('frame', x, 0, { title, color, icon }, { width: 300, height: 600 }));
    items.forEach(([t, text], j) => nodes.push(card('note', x + 20, 60 + j * 170, { title: t, text })));
  });
  return { nodes, edges: [] };
}

export function buildTemplate(id: TemplateId): BoardContent {
  return { welcome, reels, youtube, video, brand, client, calendar, ideas, shoot, moodboard }[id]();
}

/** A template's cards for an existing board: fresh ids, moved so they start at `at`. */
export function templateCards(id: TemplateId, at: { x: number; y: number }): BoardContent {
  const { nodes, edges } = buildTemplate(id);
  const minX = Math.min(...nodes.map((n) => n.position.x));
  const minY = Math.min(...nodes.map((n) => n.position.y));
  return {
    nodes: nodes.map((n) => ({ ...n, position: { x: n.position.x - minX + at.x, y: n.position.y - minY + at.y } })),
    edges,
  };
}

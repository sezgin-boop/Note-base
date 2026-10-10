import { nanoid } from 'nanoid';
import { makeCard } from './cards';
import type { BoardContent, CardData, CardEdge, CardNode, CardType } from './types';

export type TemplateId = 'welcome' | 'video' | 'calendar' | 'moodboard' | 'client';

export const TEMPLATES: { id: Exclude<TemplateId, 'welcome'>; name: string; icon: string; desc: string }[] = [
  { id: 'video', name: 'Video prodüksiyon', icon: '🎬', desc: 'Fikir → senaryo → storyboard → kurgu' },
  { id: 'calendar', name: 'İçerik takvimi', icon: '🗓️', desc: 'Fikir, çekim, kurgu, yayın kolonları' },
  { id: 'moodboard', name: 'Moodboard', icon: '🎨', desc: 'Renk paleti, referanslar, tipografi' },
  { id: 'client', name: 'Müşteri işi', icon: '💼', desc: 'Brief, teslimatlar, revizyonlar' },
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

function welcome(): BoardContent {
  const head = card('heading', 0, 0, { text: 'Hoş geldin 👋' }, { width: 520 });
  const intro = card(
    'note',
    0,
    90,
    {
      color: '#a78bfa',
      title: 'Notebase nasıl çalışır?',
      text:
        'Burası sonsuz bir tuval. Notlarını, planlarını, görsellerini ve videolarını istediğin gibi yerleştir.\n\n' +
        '• Alttaki araç çubuğundan kart ekle ya da tuvale çift tıkla\n' +
        '• Dosyaları (resim / video) direkt sürükle bırak ya da yapıştır (⌘V)\n' +
        '• Kartların kenarındaki noktalardan tutup başka karta bağla\n' +
        '• Pano kartına çift tıklayıp içine gir — panoların içinde pano olabilir\n' +
        '• ⌘K ile tüm panolarda ara, ⌘Z / ⇧⌘Z geri al / yinele',
    },
    { width: 340 },
  );
  const sample = card('board', 475, 70, {});
  const today = card('todo', 420, 250, {
    title: 'Bugün',
    items: [
      { id: nanoid(6), text: 'Örnek panoyu incele', done: false },
      { id: nanoid(6), text: 'İlk notunu ekle', done: false },
      { id: nanoid(6), text: 'Bir referans görseli sürükle', done: false },
    ],
  });
  const job = card('project', 740, 90, {
    title: 'Marka tanıtım filmi',
    client: 'Örnek Müşteri',
    deadline: new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10),
    fee: '₺25.000',
    status: 'edit',
    text: '60 sn dikey + 16:9 versiyon',
  });
  return { nodes: [head, intro, sample, today, job], edges: [wire(intro, sample), wire(sample, job)] };
}

function video(): BoardContent {
  const f1 = card('frame', 0, 0, { title: '1 · Fikir & Brief', color: '#a78bfa' }, { width: 600, height: 400 });
  const idea = card('note', 24, 60, {
    title: 'Video fikri',
    text: 'Tek cümlede: Bu video izleyiciye ne vaat ediyor?\n\nFormat: YouTube (16:9) + 3 adet Shorts',
  });
  const hook = card('note', 310, 60, {
    color: '#f59e0b',
    title: 'Hook (ilk 3 sn)',
    text: 'Seçenek A: Sonuçla başla\nSeçenek B: Soru sor\nSeçenek C: Beklenmedik görüntü',
  });
  const audience = card('note', 24, 250, { title: 'Hedef kitle', text: 'Kim izleyecek? Neden şimdi?' }, { width: 550 });

  const f2 = card('frame', 680, 0, { title: '2 · Senaryo', color: '#38bdf8' }, { width: 340, height: 400 });
  const script = card(
    'note',
    704,
    60,
    {
      title: 'Akış',
      text: '00:00 Hook\n00:05 Giriş / bağlam\n00:30 Ana bölüm 1\n02:00 Ana bölüm 2\n04:00 Sonuç\n04:30 CTA — abone ol / yorum',
    },
    { width: 290 },
  );

  const f3 = card('frame', 0, 480, { title: '3 · Storyboard', color: '#34d399' }, { width: 900, height: 330 });
  const s1 = card('scene', 24, 540, {
    number: 1,
    shot: 'Yakın',
    duration: '3s',
    text: 'Hook — yüze yakın, direkt kameraya',
    audio: 'VO + whoosh',
  });
  const s2 = card('scene', 314, 540, {
    number: 2,
    shot: 'Geniş',
    duration: '8s',
    text: 'Mekânı tanıt, establishing',
    audio: 'Müzik girer',
  });
  const s3 = card('scene', 604, 540, {
    number: 3,
    shot: 'B-roll',
    duration: '12s',
    text: 'Detay planları, eller, ekipman',
    audio: 'Müzik',
  });

  const f4 = card('frame', 980, 480, { title: '4 · Moodboard', color: '#f472b6' }, { width: 480, height: 330 });
  const c1 = card('color', 1004, 540, { hex: '#0f172a', title: 'Gece mavisi' });
  const c2 = card('color', 1154, 540, { hex: '#f59e0b', title: 'Sıcak vurgu' });
  const c3 = card('color', 1304, 540, { hex: '#e2e8f0', title: 'Kırık beyaz' });
  const moodNote = card('note', 1004, 690, { text: 'Referans görselleri ve videoları buraya sürükle ↓' }, { width: 430 });

  const shoot = card('todo', 1100, 0, {
    title: '🎥 Çekim listesi',
    items: todos('Kamera + 2 batarya', 'Lav mikrofon', 'Işık (key + fill)', 'Hafıza kartları boş mu?', 'B-roll listesi'),
  });
  const post = card('todo', 1400, 0, {
    title: '✂️ Kurgu & teslim',
    items: todos(
      'Kaba kurgu',
      'Ses temizliği + müzik',
      'Renk düzenleme',
      'Altyazı',
      'Thumbnail',
      'Başlık + açıklama + etiketler',
      'Yükle & planla',
    ),
  });

  return {
    nodes: [f1, f2, f3, f4, idea, hook, audience, script, s1, s2, s3, c1, c2, c3, moodNote, shoot, post],
    edges: [wire(idea, hook), wire(hook, script), wire(s1, s2), wire(s2, s3), wire(script, shoot), wire(shoot, post)],
  };
}

function calendar(): BoardContent {
  const cols: [string, string, string[]][] = [
    ['💡 Fikirler', '#a1a1aa', ['Kamera arkası vlog', 'Ekipman turu', 'Kurgu ipuçları — 5 kısayol']],
    ['🎥 Çekilecek', '#f59e0b', ['Haftalık vlog #12']],
    ['✂️ Kurguda', '#a78bfa', ['Müşteri BTS reels']],
    ['🚀 Yayında', '#34d399', ['Renk düzenleme rehberi']],
  ];
  const nodes: CardNode[] = [card('heading', 0, -90, { text: 'İçerik takvimi' })];
  cols.forEach(([title, color, items], i) => {
    const x = i * 320;
    nodes.push(card('frame', x, 0, { title, color }, { width: 300, height: 640 }));
    items.forEach((text, j) => nodes.push(card('note', x + 20, 60 + j * 130, { title: text, text: 'Platform: \nTarih: ' })));
  });
  return { nodes, edges: [] };
}

function moodboard(): BoardContent {
  const nodes: CardNode[] = [card('heading', 0, -90, { text: 'Moodboard' })];
  ['#0b0b0f', '#1e293b', '#a78bfa', '#f472b6', '#fde68a'].forEach((hex, i) =>
    nodes.push(card('color', i * 160, 0, { hex, title: hex.toUpperCase() })),
  );
  nodes.push(card('frame', 0, 180, { title: 'Görsel referanslar' }, { width: 780, height: 440 }));
  nodes.push(card('note', 840, 0, { title: 'Tipografi', text: 'Başlık: \nGövde: ' }));
  nodes.push(card('note', 840, 180, { title: 'Müzik / ses', text: 'Tempo, tür, referans parçalar' }));
  nodes.push(card('note', 840, 360, { title: 'His', text: 'Sinematik · sakin · gece · neon' }));
  return { nodes, edges: [] };
}

function client(): BoardContent {
  const job = card('project', 0, 0, {
    title: 'Proje adı',
    client: 'Müşteri',
    deadline: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10),
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
      text: 'Amaç:\nHedef kitle:\nMesaj:\nFormat / süre:\nReferanslar:',
    },
    { width: 300 },
  );
  const deliver = card('todo', 720, 0, {
    title: 'Teslimatlar',
    items: todos('16:9 master', '9:16 reels / shorts', '1:1 kesit', 'Altyazılı versiyon', 'Proje dosyaları'),
  });
  const rev = card('frame', 0, 300, { title: 'Revizyonlar', color: '#f87171' }, { width: 660, height: 300 });
  const r1 = card('note', 24, 360, { title: 'V1 geri bildirim', text: '' });
  const r2 = card('note', 310, 360, { title: 'V2 geri bildirim', text: '' });
  const contact = card('note', 720, 300, { title: 'İletişim', text: 'Kişi:\nE-posta:\nTelefon:' });
  return { nodes: [job, brief, deliver, rev, r1, r2, contact], edges: [wire(job, brief), wire(brief, deliver), wire(r1, r2)] };
}

export function buildTemplate(id: TemplateId): BoardContent {
  return { welcome, video, calendar, moodboard, client }[id]();
}

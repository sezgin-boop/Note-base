import { Bot, Check, Cloud, Copy, Download, ExternalLink, Link2, LogOut, RefreshCw, Smartphone, X } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useEffect, useState, type ReactNode } from 'react';
import { cloudConfigured, mediaPublicUrl } from '../cloud';
import * as db from '../db';
import { boardsToMarkdown, type OutlineBoard } from '../share/outline';
import { useStore } from '../store';
import { signIn, signOut, syncNow, useCloud } from '../sync';
import { toast, useToasts } from '../ui';

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="overlay center" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>{title}</b>
          <button className="icon-btn" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const copy = async (text: string, msg = 'Kopyalandı') => {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
  } catch {
    prompt('Kopyala:', text);
  }
};

function CopyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="copy-field">
      <span className="copy-label">{label}</span>
      <div className="copy-row">
        <input readOnly value={value} onFocus={(e) => e.target.select()} />
        <button className="btn-ghost" onClick={() => copy(value)}>
          <Copy size={13} /> Kopyala
        </button>
        <a className="btn-ghost" href={value} target="_blank" rel="noreferrer">
          <ExternalLink size={13} />
        </a>
      </div>
      {hint && <small className="muted">{hint}</small>}
    </div>
  );
}

// ---------- Account / cloud ----------

export function AccountDialog() {
  const setPanel = useStore((s) => s.setPanel);
  const cloud = useCloud();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (create: boolean) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await signIn(email.trim(), password, create);
      if (r === 'confirm') setMsg('Hesap oluşturuldu. E-postana gelen onay linkine tıkla, sonra buradan giriş yap.');
    } catch (e) {
      setMsg(trError((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Bulut senkronu" onClose={() => setPanel(null)}>
      {!cloudConfigured ? (
        <div className="stack">
          <p>
            Bulut henüz bağlanmamış. Bağlandığında panoların, görsellerin ve videoların her cihazda (telefon, bilgisayar) aynı
            olur ve panolarını link ile paylaşabilirsin.
          </p>
          <p className="muted small">
            Kurulum bir kez yapılır (yaklaşık 5 dakika): ücretsiz bir Supabase projesi aç, <code>supabase/schema.sql</code>{' '}
            dosyasını çalıştır, iki anahtarı Vercel'e ekle. Adımlar projenin README dosyasında.
          </p>
        </div>
      ) : cloud.user ? (
        <div className="stack">
          <div className="account-row">
            <Cloud size={16} />
            <div>
              <b>{cloud.user.email}</b>
              <div className="muted small">
                <SyncLabel />
              </div>
            </div>
          </div>
          {cloud.error && cloud.status === 'error' && <p className="error small">{cloud.error}</p>}
          <div className="row">
            <button className="btn" onClick={() => syncNow()}>
              <RefreshCw size={14} /> Şimdi senkronize et
            </button>
            <button
              className="btn-ghost"
              onClick={async () => {
                await signOut();
                toast('Çıkış yapıldı. Panoların bu cihazda kalmaya devam ediyor.');
              }}
            >
              <LogOut size={14} /> Çıkış yap
            </button>
          </div>
          <p className="muted small">
            Değişiklikler otomatik olarak buluta gider; diğer cihazlar uygulamayı açtığında ya da 30 saniyede bir yeni halini
            alır. İnternet yokken de çalışmaya devam edebilirsin, bağlantı gelince gönderilir.
          </p>
        </div>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
        >
          <p className="muted small">Giriş yap; panoların her cihazında aynı olsun.</p>
          <input
            className="field-input"
            type="email"
            autoComplete="email"
            placeholder="E-posta"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="field-input"
            type="password"
            autoComplete="current-password"
            placeholder="Şifre (en az 6 karakter)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {msg && <p className="small notice">{msg}</p>}
          <div className="row">
            <button className="btn" disabled={busy} type="submit">
              Giriş yap
            </button>
            <button className="btn-ghost" disabled={busy} type="button" onClick={() => submit(true)}>
              Hesap oluştur
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

const trError = (m: string) =>
  /invalid login/i.test(m)
    ? 'E-posta ya da şifre hatalı. Henüz hesabın yoksa aşağıdaki "Hesap oluştur" butonuna bas.'
    : /already registered/i.test(m)
      ? 'Bu e-posta ile zaten bir hesap var. Giriş yap.'
      : /not confirmed/i.test(m)
        ? 'E-posta henüz onaylanmamış. Gelen kutundaki linke tıkla.'
        : /signups not allowed/i.test(m)
          ? 'Yeni hesap açma kapalı.'
          : m;

export function SyncLabel() {
  const { status, lastSync, uploads } = useCloud();
  const text: Record<string, string> = {
    off: 'Bulut kapalı',
    syncing: 'Senkronize ediliyor…',
    synced: lastSync
      ? `Senkronize · ${new Date(lastSync).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`
      : 'Senkronize',
    offline: 'Çevrimdışı — bağlantı gelince gönderilecek',
    error: 'Senkron hatası',
  };
  return (
    <>
      {text[status]}
      {uploads > 0 && ` · ${uploads} dosya yükleniyor`}
    </>
  );
}

// ---------- Share ----------

/** The current board and its sub-boards, ready for the outline renderer. */
async function collectTree(): Promise<OutlineBoard[]> {
  const { boards, currentId, nodes, edges, shared } = useStore.getState();
  const ids: string[] = [];
  const walk = (id: string) => {
    ids.push(id);
    boards.filter((b) => b.parentId === id).forEach((b) => walk(b.id));
  };
  walk(currentId);
  return Promise.all(
    ids.map(async (id) => {
      const meta = boards.find((b) => b.id === id)!;
      const content =
        id === currentId ? { nodes, edges } : shared ? (shared.contents[id] ?? { nodes: [], edges: [] }) : await db.loadBoard(id);
      return { id, name: meta.name, icon: meta.icon, parentId: id === currentId ? null : meta.parentId, content };
    }),
  );
}

export async function boardMarkdown(viewUrl?: string) {
  const tree = await collectTree();
  const uploaded = new Set<string>(JSON.parse(localStorage.getItem('notebase:uploaded') ?? '[]'));
  const shared = useStore.getState().shared;
  return boardsToMarkdown(tree, {
    rootId: tree[0].id,
    viewUrl,
    mediaUrl: (id) => (cloudConfigured && (uploaded.has(id) || shared) ? mediaPublicUrl(id) : null),
    comments: Object.values(useStore.getState().clientComments).flat(),
  });
}

export function ShareDialog() {
  const { setPanel, boards, currentId, renameBoard } = useStore();
  const cloud = useCloud();
  const board = boards.find((b) => b.id === currentId)!;
  const origin = location.origin;
  const subCount = (function count(id: string): number {
    return boards.filter((b) => b.parentId === id).reduce((n, b) => n + 1 + count(b.id), 0);
  })(currentId);

  const enable = () => {
    renameBoard(board.id, { shareId: nanoid(16), shareComments: true });
    setTimeout(() => syncNow(), 600);
  };

  const downloadMd = async () => {
    const md = await boardMarkdown(board.shareId ? `${origin}/?share=${board.shareId}` : undefined);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
    a.download = `${board.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'pano'}.md`;
    a.click();
  };

  return (
    <Modal title={`Paylaş · ${board.icon} ${board.name}`} onClose={() => setPanel(null)}>
      <div className="stack">
        <div className="share-block">
          <div className="share-title">
            <Bot size={15} /> Yapay zekâya ver
          </div>
          <p className="muted small">
            Panoyu {subCount ? `(${subCount} alt pano dahil) ` : ''}bölümleri, kartları ve aralarındaki oklarla birlikte düzenli
            metne çevirir. Claude ya da ChatGPT'ye yapıştır, fikrini anlatsın.
          </p>
          <div className="row">
            <button
              className="btn"
              onClick={async () =>
                copy(
                  await boardMarkdown(board.shareId ? `${origin}/?share=${board.shareId}` : undefined),
                  'Pano metni kopyalandı — yapay zekâya yapıştır',
                )
              }
            >
              <Copy size={14} /> Metin olarak kopyala
            </button>
            <button className="btn-ghost" onClick={downloadMd}>
              <Download size={14} /> .md indir
            </button>
          </div>
        </div>

        <div className="share-block">
          <div className="share-title">
            <Link2 size={15} /> Link ile paylaş
          </div>
          {!cloudConfigured || !cloud.user ? (
            <>
              <p className="muted small">Link ile paylaşmak için bulut senkronunu aç; pano buluta gitmeli ki link çalışsın.</p>
              <button className="btn-ghost" onClick={() => setPanel('account')}>
                <Cloud size={14} /> {cloudConfigured ? 'Giriş yap' : 'Bulutu bağla'}
              </button>
            </>
          ) : !board.shareId ? (
            <>
              <p className="muted small">
                Linki olan herkes bu panoyu{subCount ? ' ve alt panolarını' : ''} görebilir ama değiştiremez. İstediğin zaman
                kapatırsın.
              </p>
              <button className="btn" onClick={enable}>
                <Link2 size={14} /> Paylaşım linki oluştur
              </button>
            </>
          ) : (
            <>
              <CopyField
                label="Müşteri linki"
                value={`${origin}/?share=${board.shareId}`}
                hint="Pano tuval olarak açılır; videolara zaman damgalı yorum bırakabilirler."
              />
              <CopyField
                label="Yapay zekâ / okuma linki"
                value={`${origin}/s/${board.shareId}`}
                hint="Tüm içerik düz sayfa olarak gelir. Claude, ChatGPT gibi araçlara bu linki ver."
              />
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={board.shareComments ?? true}
                  onChange={(e) => {
                    renameBoard(board.id, { shareComments: e.target.checked });
                    setTimeout(() => syncNow(), 300);
                  }}
                />
                Görüntüleyenler video yorumu bırakabilsin
              </label>
              <div className="row">
                <span className="muted small">
                  <SyncLabel />
                </span>
                <button
                  className="btn-ghost danger"
                  onClick={() => {
                    if (!confirm('Paylaşım kapatılsın mı? Mevcut linkler çalışmaz hale gelir.')) return;
                    renameBoard(board.id, { shareId: null });
                    setTimeout(() => syncNow(), 300);
                  }}
                >
                  Paylaşımı kapat
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ---------- Install (PWA) ----------

let deferredPrompt: any = null;
const installListeners = new Set<() => void>();
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installListeners.forEach((l) => l());
});

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

export function useCanInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    installListeners.add(l);
    return () => void installListeners.delete(l);
  }, []);
  return !isStandalone();
}

export function InstallDialog() {
  const setPanel = useStore((s) => s.setPanel);
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return (
    <Modal title="Uygulama olarak yükle" onClose={() => setPanel(null)}>
      <div className="stack">
        <p className="muted small">
          Notebase'i ana ekranına / masaüstüne ekle: kendi simgesiyle, tam ekran açılır ve internet yokken de çalışır.
        </p>
        {deferredPrompt ? (
          <button
            className="btn"
            onClick={async () => {
              deferredPrompt.prompt();
              const choice = await deferredPrompt.userChoice;
              deferredPrompt = null;
              if (choice?.outcome === 'accepted') {
                toast('Yüklendi');
                setPanel(null);
              }
            }}
          >
            <Smartphone size={14} /> Şimdi yükle
          </button>
        ) : ios ? (
          <ol className="steps">
            <li>
              Safari'de alttaki <b>Paylaş</b> düğmesine dokun (kare ve yukarı ok).
            </li>
            <li>
              <b>Ana Ekrana Ekle</b>'yi seç.
            </li>
            <li>
              <b>Ekle</b>'ye dokun — Notebase ana ekranında.
            </li>
          </ol>
        ) : (
          <ol className="steps">
            <li>
              <b>Chrome / Edge (bilgisayar):</b> adres çubuğunun sağındaki yükle simgesine (⊕) tıkla.
            </li>
            <li>
              <b>Android:</b> tarayıcı menüsü (⋮) → <b>Uygulamayı yükle</b> ya da <b>Ana ekrana ekle</b>.
            </li>
          </ol>
        )}
      </div>
    </Modal>
  );
}

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <Check size={14} /> {t.text}
        </div>
      ))}
    </div>
  );
}

import { ReactFlowProvider } from '@xyflow/react';
import { useEffect, useState } from 'react';
import { fetchShared } from './cloud';
import { hostname, isVideoUrl } from './db';
import { AccountDialog, InstallDialog, ShareDialog, Toasts } from './components/Dialogs';
import { startSync } from './sync';
import { Canvas } from './components/Canvas';
import { JobsPanel, Lightbox, SearchPalette, Topbar } from './components/Panels';
import { Sidebar } from './components/Sidebar';
import { TOOLS, Toolbar, useAddAtCenter } from './components/Toolbar';
import { justCreated, useStore } from './store';

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

function Shortcuts() {
  const addAtCenter = useAddAtCenter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'k') return e.preventDefault(), s.setPanel(s.panel === 'search' ? null : 'search');
      if (mod && key === 'j') return e.preventDefault(), s.setPanel(s.panel === 'jobs' ? null : 'jobs');
      if (e.key === 'Escape') {
        if (s.lightbox) return s.setLightbox(null);
        if (s.menu) return s.setMenu(null);
        if (isTyping(e.target)) return (e.target as HTMLElement).blur();
        return s.setPanel(null);
      }
      if (isTyping(e.target) || s.panel === 'search') return;
      if (mod && key === 'z') return e.preventDefault(), e.shiftKey ? s.redo() : s.undo();
      if (mod && key === 'y') return e.preventDefault(), s.redo();
      if (mod && key === 'd') return e.preventDefault(), s.duplicateSelected();
      if (mod && key === 'a') return e.preventDefault(), s.setNodes((ns) => ns.map((n) => ({ ...n, selected: true })));
      if (e.key === 'Delete' || e.key === 'Backspace') return s.deleteSelected();
      if (mod || e.altKey || justCreated()) return;
      const tool = TOOLS.find((t) => t.key.toLowerCase() === key);
      if (tool) {
        e.preventDefault();
        addAtCenter(tool.type);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addAtCenter]);
  return null;
}

/** Android "share to Notebase" (manifest share_target) lands here as ?url=&text=&title=. */
function acceptSharedIntent() {
  const p = new URLSearchParams(location.search);
  const url = p.get('url') || p.get('text')?.match(/https?:\/\/\S+/)?.[0];
  const text = p.get('text') || p.get('title');
  if (!url && !text) return;
  history.replaceState(null, '', '/');
  const s = useStore.getState();
  const v = s.viewport ?? { x: 0, y: 0, zoom: 1 };
  const at = { x: (window.innerWidth / 2 - v.x) / v.zoom - 140, y: (window.innerHeight / 2 - v.y) / v.zoom - 60 };
  if (url && isVideoUrl(url)) s.addCard('video', at, { url, caption: p.get('title') ?? undefined });
  else if (url) s.addCard('link', at, { url, title: p.get('title') || hostname(url) });
  else s.addCard('note', at, { text: text ?? '' });
}

const shareId = new URLSearchParams(location.search).get('share');

export default function App() {
  const { ready, init, initShared, panel, sidebar, toggleSidebar, setPanel, readOnly } = useStore();
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!shareId) {
      init().then(() => {
        startSync();
        acceptSharedIntent();
      });
      return;
    }
    fetchShared(shareId)
      .then((bundle) => (bundle ? initShared(bundle, shareId) : setFailed('Bu paylaşım kapatılmış ya da link hatalı.')))
      .catch((e) => setFailed(`Pano yüklenemedi: ${e.message}`));
  }, [init, initShared]);

  if (failed)
    return (
      <div className="loading">
        <div className="fail">
          <b>Pano açılamadı</b>
          <span>{failed}</span>
          <a href="/">Notebase'e git</a>
        </div>
      </div>
    );
  if (!ready) return <div className="loading">Notebase</div>;

  return (
    <ReactFlowProvider>
      <div className={`app ${sidebar ? '' : 'no-sidebar'}`}>
        {sidebar && <Sidebar />}
        {(sidebar || panel === 'jobs') && (
          <div className="side-backdrop" onClick={() => (panel === 'jobs' ? setPanel(null) : toggleSidebar())} />
        )}
        <main className="main">
          <Topbar />
          <Canvas />
          {!readOnly && <Toolbar />}
        </main>
        {panel === 'jobs' && <JobsPanel />}
      </div>
      {panel === 'search' && <SearchPalette />}
      {panel === 'share' && <ShareDialog />}
      {panel === 'account' && <AccountDialog />}
      {panel === 'install' && <InstallDialog />}
      <Lightbox />
      <Toasts />
      {!readOnly && <Shortcuts />}
    </ReactFlowProvider>
  );
}

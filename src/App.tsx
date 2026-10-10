import { ReactFlowProvider } from '@xyflow/react';
import { useEffect } from 'react';
import { Canvas } from './components/Canvas';
import { JobsPanel, Lightbox, SearchPalette, Topbar } from './components/Panels';
import { Sidebar } from './components/Sidebar';
import { TOOLS, Toolbar, useAddAtCenter } from './components/Toolbar';
import { useStore } from './store';

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
        if (isTyping(e.target)) return (e.target as HTMLElement).blur();
        return s.setPanel(null);
      }
      if (isTyping(e.target) || s.panel === 'search') return;
      if (mod && key === 'z') return e.preventDefault(), e.shiftKey ? s.redo() : s.undo();
      if (mod && key === 'y') return e.preventDefault(), s.redo();
      if (mod && key === 'd') return e.preventDefault(), s.duplicateSelected();
      if (mod && key === 'a') return e.preventDefault(), s.setNodes((ns) => ns.map((n) => ({ ...n, selected: true })));
      if (e.key === 'Delete' || e.key === 'Backspace') return s.deleteSelected();
      if (mod || e.altKey) return;
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

export default function App() {
  const { ready, init, panel, sidebar } = useStore();
  useEffect(() => {
    init();
  }, [init]);

  if (!ready) return <div className="loading">Notebase</div>;

  return (
    <ReactFlowProvider>
      <div className={`app ${sidebar ? '' : 'no-sidebar'}`}>
        {sidebar && <Sidebar />}
        <main className="main">
          <Topbar />
          <Canvas />
          <Toolbar />
        </main>
        {panel === 'jobs' && <JobsPanel />}
      </div>
      {panel === 'search' && <SearchPalette />}
      <Lightbox />
      <Shortcuts />
    </ReactFlowProvider>
  );
}

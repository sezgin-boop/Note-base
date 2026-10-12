import { Check, Copy, RefreshCw, Send, Share } from 'lucide-react';
import { useState } from 'react';
import { cloudConfigured, supabase } from '../cloud';
import { useStore } from '../store';
import { useCloud } from '../sync';
import { toast } from '../ui';
import { Modal } from './Dialogs';

const ios = /iphone|ipad|ipod|macintosh/i.test(navigator.userAgent) && !/android/i.test(navigator.userAgent);

/**
 * "Save from your phone": share a link, text or photo from any app straight into the Inbox.
 * Android: the installed app is in the share menu. iPhone: a Shortcut sends it to a personal link.
 */
export function PhoneCaptureDialog() {
  const setPanel = useStore((s) => s.setPanel);
  const user = useCloud((c) => c.user);
  const [tab, setTab] = useState<'iphone' | 'android'>(/android/i.test(navigator.userAgent) ? 'android' : 'iphone');
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tested, setTested] = useState<string | null>(null);

  const getLink = async (renew = false) => {
    setBusy(true);
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      const res = await fetch('/api/capture?step=link', {
        method: 'POST',
        headers: { authorization: `Bearer ${token ?? ''}`, 'content-type': 'application/json' },
        body: JSON.stringify({ renew }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.url) throw new Error(j.error || `The server said ${res.status}`);
      setLink(j.url);
      setTested(null);
      if (renew) toast('New link made — the old one no longer works');
    } catch (e) {
      toast(`Couldn't make the link: ${(e as Error).message}`, 6000);
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    if (!link) return;
    const res = await fetch(link, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'Test from Notebase ✓' });
    setTested((await res.text()).replace(/^✓\s*/, ''));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link!);
      toast('Link copied');
    } catch {
      prompt('Copy the link:', link!);
    }
  };

  return (
    <Modal title="Save from your phone" onClose={() => setPanel(null)}>
      <div className="stack phone-capture">
        <p className="muted small">
          See a reel, a video or a photo you like? Share it from any app (Instagram, TikTok, YouTube, Safari, Photos…) and it
          lands in your <b>📥 Inbox</b> board.
        </p>
        <div className="seg">
          <button className={tab === 'iphone' ? 'on' : ''} onClick={() => setTab('iphone')}>
            iPhone
          </button>
          <button className={tab === 'android' ? 'on' : ''} onClick={() => setTab('android')}>
            Android
          </button>
        </div>

        {tab === 'android' ? (
          <ol className="steps">
            <li>
              Install Notebase on the phone (in Chrome: menu ⋮ → <b>Install app</b> / <b>Add to Home screen</b>).
            </li>
            <li>
              In any app tap <b>Share</b> and pick <b>Notebase</b>. Links and text go straight into your Inbox.
            </li>
          </ol>
        ) : !cloudConfigured || !user ? (
          <div className="stack">
            <p className="small">
              On iPhone this works through your Notebase cloud account, so things you share arrive on every device.
            </p>
            <button className="btn" onClick={() => setPanel('account')}>
              Sign in to cloud sync first
            </button>
          </div>
        ) : (
          <>
            <div className="capture-step">
              <b>1 · Your private link</b>
              {link ? (
                <>
                  <div className="capture-link">
                    <code>{link}</code>
                    <button className="icon-btn" title="Copy" onClick={copy}>
                      <Copy size={14} />
                    </button>
                  </div>
                  <div className="row">
                    <button className="btn-ghost" onClick={test}>
                      <Send size={13} /> Send a test
                    </button>
                    <button className="btn-ghost" disabled={busy} onClick={() => getLink(true)}>
                      <RefreshCw size={13} /> Make a new link
                    </button>
                  </div>
                  {tested && (
                    <p className="small capture-ok">
                      <Check size={13} /> {tested}
                    </p>
                  )}
                  <p className="muted small">
                    Keep it to yourself: whoever has it can add things to your Inbox (and nothing else). A new link switches the
                    old one off.
                  </p>
                </>
              ) : (
                <button className="btn" disabled={busy} onClick={() => getLink()}>
                  {busy ? 'Making…' : 'Make my link'}
                </button>
              )}
            </div>
            <div className="capture-step">
              <b>2 · A Shortcut that sends to it</b> <span className="muted small">(once, about a minute)</span>
              <ol className="steps">
                <li>
                  Open the <b>Shortcuts</b> app → <b>＋</b> → name it <b>Save to Notebase</b>.
                </li>
                <li>
                  Tap <b>ⓘ</b> (Details) → turn on <b>Show in Share Sheet</b>.
                </li>
                <li>
                  Add the action <b>Get Contents of URL</b>. URL: <b>paste your link</b>. Tap <b>Show More</b>: Method <b>POST</b>
                  , Request Body <b>File</b>, File: <b>Shortcut Input</b>.
                </li>
                <li>
                  Add <b>Show Notification</b> with <b>Contents of URL</b> (you'll see “✓ saved”).
                </li>
              </ol>
            </div>
            <div className="capture-step">
              <b>3 · Use it</b>
              <p className="small">
                In any app tap <Share size={12} /> <b>Share</b> → <b>Save to Notebase</b>. Photos up to 4 MB work too (add a{' '}
                <b>Resize Image</b> step before step 3 for bigger ones).
              </p>
            </div>
          </>
        )}
        {ios && tab === 'android' && <p className="muted small">You're on an Apple device — the iPhone tab is for you.</p>}
      </div>
    </Modal>
  );
}

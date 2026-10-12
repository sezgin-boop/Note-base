// Stateless tokens: small JSON payloads encrypted (AES-GCM) with a key derived from the Supabase
// secret key. Nothing is stored; a token is valid if it decrypts and hasn't expired.

import { SUPABASE_SECRET_KEY } from './env';

const enc = new TextEncoder();
const dec = new TextDecoder();

let keyPromise: Promise<CryptoKey> | null = null;
const key = () =>
  (keyPromise ??= crypto.subtle
    .digest('SHA-256', enc.encode(`notebase-connector:v1:${SUPABASE_SECRET_KEY}`))
    .then((raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])));

const b64url = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export type Sealed =
  | { t: 'client'; r: string[]; n?: string }
  | { t: 'code'; uid: string; cc: string; ru: string; cid: string; exp: number }
  | { t: 'access'; uid: string; exp: number }
  | { t: 'refresh'; uid: string; exp: number }
  /** A link that lets photos / videos be uploaded onto one board for a while. */
  | { t: 'upload'; uid: string; board: string; exp: number }
  /** A personal link that saves whatever is shared to it into the Inbox (phone share sheet). `v` must
   *  match the account's current capture version, so making a new link switches the old one off. */
  | { t: 'capture'; uid: string; v: number };

export async function seal(payload: Sealed): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), enc.encode(JSON.stringify(payload))),
  );
  const out = new Uint8Array(iv.length + data.length);
  out.set(iv);
  out.set(data, iv.length);
  return `nb1.${b64url(out)}`;
}

/** The payload if the token is genuine, of the expected type and not expired; otherwise null. */
export async function unseal<T extends Sealed['t']>(
  token: string | null | undefined,
  type: T,
): Promise<Extract<Sealed, { t: T }> | null> {
  if (!token?.startsWith('nb1.')) return null;
  try {
    const raw = fromB64url(token.slice(4));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, await key(), raw.slice(12));
    const p = JSON.parse(dec.decode(plain)) as Sealed;
    if (p.t !== type) return null;
    if ('exp' in p && p.exp < Date.now() / 1000) return null;
    return p as Extract<Sealed, { t: T }>;
  } catch {
    return null;
  }
}

export async function sha256b64url(text: string) {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))));
}

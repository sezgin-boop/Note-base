// Settings for the server functions (api/*), read from Vercel's environment variables.

const env = (...names: string[]) => names.map((n) => process.env[n]).find(Boolean) ?? '';

export const SUPABASE_URL = env('VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL').replace(/\/$/, '');

/** Public (anon / publishable) key: used to check a user's email and password. */
export const SUPABASE_ANON_KEY = env(
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
);

/**
 * Secret key (service_role / sb_secret_…): lets the Claude connector read and write the signed-in
 * user's boards. Only ever used on the server. It also seals the connector's tokens, so replacing
 * it in Supabase disconnects every connected AI app.
 */
export const SUPABASE_SECRET_KEY = env('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY');

export const connectorReady = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SECRET_KEY);

/** Headers for a Supabase API call: legacy keys are JWTs and also go in Authorization, new keys must not. */
export const keyHeaders = (key: string): Record<string, string> => ({
  apikey: key,
  ...(key.startsWith('eyJ') ? { authorization: `Bearer ${key}` } : {}),
});

export const originOf = (req: Request) => {
  const url = new URL(req.url);
  const host = req.headers.get('x-forwarded-host') ?? url.host;
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  return `${proto}://${host}`;
};

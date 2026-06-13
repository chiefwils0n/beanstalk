// Opt-in single-password gate. Enabled only when AUTH_PASSWORD is set;
// otherwise the app is open (its previous behavior). The session is a stateless
// HMAC-signed cookie — no database — with the signing key derived from the
// password, so a single env var configures everything.

export const SESSION_COOKIE = "beanstalk_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function password(): string {
  return process.env.AUTH_PASSWORD ?? "";
}

export function authEnabled(): boolean {
  return password().length > 0;
}

const encoder = new TextEncoder();

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode("beanstalk-session:" + password()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Buffer.from(new Uint8Array(sig)).toString("base64url");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** A signed session token: `<expiryMs>.<hmac>`. */
export async function createSession(): Promise<string> {
  const exp = String(Date.now() + SESSION_TTL_MS);
  return `${exp}.${await sign(exp)}`;
}

/** Verify a session token's signature and expiry. */
export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  return constantTimeEqual(sig, await sign(exp));
}

/** Constant-time comparison of a submitted password against AUTH_PASSWORD. */
export function checkPassword(input: string): boolean {
  const pw = password();
  return pw.length > 0 && constantTimeEqual(input, pw);
}

// ── API / OAuth constants ──────────────────────────────────────────────────────
export const API_BASE      = 'https://moph-meet.moph.go.th';
export const MEETING_DOMAIN = 'moph-meetingroom.moph.go.th';

// ── Provider ID OAuth ───────────────────────────────────────────────────────
// Note: username/password login is always available in the app (no flag). The
// backend still has its own MANUAL_LOGIN_ENABLED env; if it is disabled there,
// /api/auth returns 403 and the form shows an error.
export const PROVIDER_ID_CLIENT_ID    = '01953bd5-fc1e-73d4-9142-7598d70c34dc';
export const PROVIDER_ID_REDIRECT_URI = `${API_BASE}/auth/providerid/callback`;

/** Full OAuth URL; pass state='mobile' so the backend redirects to mophmeet:// */
export function providerIdOAuthUrl(): string {
  const params = new URLSearchParams({
    client_id:     PROVIDER_ID_CLIENT_ID,
    redirect_uri:  PROVIDER_ID_REDIRECT_URI,
    response_type: 'code',
    state:         'mobile',
  });
  return `https://moph.id.th/oauth/redirect?${params.toString()}`;
}

// ── API helpers ────────────────────────────────────────────────────────────────
export async function apiFetch(path: string, token: string, opts: RequestInit = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers as Record<string, string> || {}),
    },
  });
  return res;
}

/** Username/password login via core-lite /api/auth (mirrors user-app-lite). */
export async function directLogin(username: string, password: string): Promise<{ token: string; user: any }> {
  const res = await fetch(`${API_BASE}/api/auth`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json; charset=utf-8',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error('invalidUsernameOrPassword');
  return res.json();
}

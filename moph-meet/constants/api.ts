// ── API / OAuth constants ──────────────────────────────────────────────────────
export const API_BASE      = 'https://moph-meet.moph.go.th';
export const MEETING_DOMAIN = 'moph-meetingroom.moph.go.th';

// Provider ID OAuth
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

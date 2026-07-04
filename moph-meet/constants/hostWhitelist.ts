// ── WebView host whitelist ──────────────────────────────────────────────────
//
// This app is a WebView wrapper. As a native security surface it must only allow
// the WebView to navigate to a fixed set of trusted hosts (domain whitelist).
//
// The navigation decision is extracted here as a PURE, side-effect-free function
// so it can be unit / property tested independently of the React Native runtime.
//
// Property 3 (design.md, Requirement 6.5):
//   For any URL and any ALLOWED_HOSTS list, `isHostAllowed` returns `true` iff the
//   URL's host matches a member of ALLOWED_HOSTS, and `false` for every other host
//   (invalid / unparseable URLs are treated as not allowed).

/**
 * Hosts the WebView is permitted to navigate to.
 *
 * Kept as exact host names (host comparison is case-insensitive). Update this
 * list if the backend / meeting infrastructure hosts change.
 */
export const ALLOWED_HOSTS: string[] = [
  'moph-meet.moph.go.th',          // user-app-lite / API base
  'moph-meetingroom.moph.go.th',   // Jitsi meeting domain (MEETING_DOMAIN)
  'moph.id.th',                    // Provider ID OAuth
  'provider.id.th',                // Provider service
  'imauth.bora.dopa.go.th',        // ThaID OAuth
  'localhost',                     // local dev
];

/**
 * URL schemes used by inline-HTML WebViews and non-navigational loads that must
 * always be permitted (they carry no host to whitelist).
 */
const INLINE_SCHEMES = ['about:', 'data:', 'blob:', 'file:', 'javascript:'];

/**
 * Pure host-whitelist decider (Property 3 / Requirement 6.5).
 *
 * Returns `true` iff `url` parses to a host that is a member of `allowedHosts`
 * (case-insensitive). Any input that is not a non-empty string, an empty
 * allow-list, or a URL that cannot be parsed / has no host yields `false`.
 *
 * @param url          the target URL string to evaluate
 * @param allowedHosts the whitelist of permitted hosts
 */
export function isHostAllowed(url: string, allowedHosts: string[]): boolean {
  if (typeof url !== 'string' || url.trim() === '') return false;
  if (!Array.isArray(allowedHosts) || allowedHosts.length === 0) return false;

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false; // invalid / unparseable URL → not allowed
  }
  if (!hostname) return false;

  const host = hostname.toLowerCase();
  return allowedHosts.some(
    (h) => typeof h === 'string' && h.toLowerCase() === host,
  );
}

/**
 * WebView navigation gate used by `onShouldStartLoadWithRequest`.
 *
 * Preserves inline-HTML WebView behavior: non-http(s) schemes (about:/data:/
 * blob:/file:) and sub-frame / sub-resource loads are always allowed, since the
 * meeting screens render inline Jitsi HTML. Top-level http(s) navigations are
 * gated through {@link isHostAllowed} against the whitelist.
 *
 * @param request      the navigation request from react-native-webview
 * @param allowedHosts the whitelist of permitted hosts (defaults to ALLOWED_HOSTS)
 */
export function shouldAllowNavigation(
  request: { url?: string; isTopFrame?: boolean },
  allowedHosts: string[] = ALLOWED_HOSTS,
): boolean {
  const url = request?.url ?? '';
  if (typeof url !== 'string' || url === '') return true; // let WebView handle empties

  const lower = url.toLowerCase();
  // Inline-content / non-navigational schemes have no host to whitelist.
  if (INLINE_SCHEMES.some((s) => lower.startsWith(s))) return true;
  // Only gate real web navigations.
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) return true;
  // Sub-frame / sub-resource loads (iOS reports isTopFrame === false) load freely.
  if (request?.isTopFrame === false) return true;

  return isHostAllowed(url, allowedHosts);
}

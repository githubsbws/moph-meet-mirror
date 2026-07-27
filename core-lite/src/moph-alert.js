'use strict';

// MOPH Alert API client.  This is intentionally separate from LINE Messaging
// API: recipients are identified by CID and the access token is issued by MOPH
// Account Center.  No CID, credential, or access token is ever logged here.

function uniqueCids(cids) {
    return [...new Set((Array.isArray(cids) ? cids : [])
        .map(value => String(value || '').trim())
        .filter(value => /^\d{13}$/.test(value)))];
}

function readToken(responseText) {
    const text = String(responseText || '').trim();
    if (!text) return '';
    try {
        const json = JSON.parse(text);
        return String(
            json.access_token || json.token || json.jwt ||
            json.data?.access_token || json.data?.token || json.data?.jwt || ''
        ).trim();
    } catch (_) {
        // Some MOPH Account Center deployments return the raw JWT body.
        return /^eyJ[a-zA-Z0-9._-]+$/.test(text) ? text : '';
    }
}

function jwtExpiry(token) {
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
        const exp = Number(payload.exp) * 1000;
        // Refresh a minute early. Do not trust malformed/missing expiry values.
        return Number.isFinite(exp) && exp > Date.now() + 60000 ? exp - 60000 : Date.now() + (23 * 60 * 60 * 1000);
    } catch (_) {
        return Date.now() + (23 * 60 * 60 * 1000);
    }
}

function createMophAlertClient({ env = process.env, fetchImpl = global.fetch, logger = console } = {}) {
    const enabled = String(env.MOPH_ALERT_ENABLED || '').toLowerCase() === 'true';
    const username = String(env.MOPH_ALERT_USERNAME || '').trim();
    const passwordHash = String(env.MOPH_ALERT_PASSWORD_HASH || '').trim();
    const tokenUrl = String(env.MOPH_ALERT_TOKEN_URL || 'https://cvp1.moph.go.th/token').trim();
    const apiBaseUrl = String(env.MOPH_ALERT_API_BASE_URL || 'https://morpromt2c.moph.go.th').replace(/\/$/, '');
    const cachedTokens = new Map();

    function isConfigured() {
        return enabled && Boolean(username && passwordHash && apiBaseUrl && tokenUrl);
    }

    async function getAccessToken(hospitalCode) {
        const cachedToken = cachedTokens.get(hospitalCode);
        if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

        const url = new URL(tokenUrl);
        url.searchParams.set('Action', 'get_moph_access_token');
        url.searchParams.set('user', username);
        url.searchParams.set('password_hash', passwordHash);
        url.searchParams.set('hospital_code', hospitalCode);
        const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`mophAlertTokenStatus:${response.status}`);
        const token = readToken(await response.text());
        if (!token) throw new Error('mophAlertTokenMissing');
        cachedTokens.set(hospitalCode, { value: token, expiresAt: jwtExpiry(token) });
        return token;
    }

    async function sendText({ hospitalCode, cids, text }) {
        if (!isConfigured()) {
            return { skipped: true, reason: 'notConfigured' };
        }
        const hcode = String(hospitalCode || '').trim();
        if (!/^\d{5}$/.test(hcode)) return { skipped: true, reason: 'hospitalCodeMissing' };
        const recipients = uniqueCids(cids);
        if (recipients.length === 0) return { skipped: true, reason: 'noRecipients' };
        const message = String(text || '').trim();
        if (!message) return { skipped: true, reason: 'emptyMessage' };

        const send = async (retryOnUnauthorized) => {
            const token = await getAccessToken(hcode);
            const response = await fetchImpl(`${apiBaseUrl}/api/v2/send-message/send-now`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    datas: recipients,
                    messages: [{ type: 'text', text: message }],
                }),
            });
            if (response.status === 401 && retryOnUnauthorized) {
                cachedTokens.delete(hcode);
                return send(false);
            }
            if (!response.ok) throw new Error(`mophAlertSendStatus:${response.status}`);
            const body = await response.text();
            try {
                const payload = JSON.parse(body);
                if (payload.message_code && Number(payload.message_code) >= 400) {
                    throw new Error(`mophAlertSendCode:${payload.message_code}`);
                }
            } catch (error) {
                if (error.message.startsWith('mophAlertSendCode:')) throw error;
            }
            return { sent: recipients.length };
        };

        return send(true);
    }

    function logConfigurationHint() {
        if (!enabled) return;
        if (!isConfigured()) logger.warn('[notify] MOPH Alert enabled but configuration is incomplete — skip.');
    }

    return { isConfigured, sendText, logConfigurationHint };
}

module.exports = { createMophAlertClient };

# Temporarily disable Telemedicine Consent

## Requested change

Pause the consent flow without deleting its implementation.

## Delivered

- Core Lite no longer returns `428 telemedConsentRequired` for an authenticated request.
- Web login and dashboard no longer redirect to `consent.html`.
- Mobile login and OAuth deep links now go directly to the dashboard.
- Consent API and previously recorded consent audit data remain intact, but the page is not reached in the normal flow.

## Re-enable later

Restore the commented consent guard in `core-lite/src/middlewares/auth.js` and the commented UI checks/redirects marked `Consent is temporarily disabled`.

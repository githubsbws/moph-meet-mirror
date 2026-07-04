// Feature: mobile-sdk53-upgrade (task 10.1 — make Fresco gif/webp flags durable)
//
// Why a config plugin (not values hand-edited into android/gradle.properties):
// `expo prebuild --clean` wipes and regenerates android/, which rewrites
// android/gradle.properties with Expo's DEFAULTS:
//   expo.gif.enabled=true
//   expo.webp.enabled=true
// That re-adds the Fresco decoders libgifimage.so + libstatic-webp.so to the
// APK and undoes task 10.1 (we set both false because the app uses no native
// gif/webp — it's a WebView wrapper). Implementing the flags as a plugin makes
// them re-apply on every prebuild so they survive future regenerations
// (same durability approach as plugins/withUnsafeOkHttp.js).
//
// What it does on prebuild: withGradleProperties ensures the two properties are
// set to `false` — replacing any existing entry (e.g. the regenerated Expo
// default `true`) and adding them when missing. Idempotent.
//
// SCOPE (Requirement 10): only touches moph-meet/ (android/gradle.properties
// via prebuild).

const { withGradleProperties } = require('@expo/config-plugins');

/** Gradle property keys that gate the Fresco gif / static-webp decoders. */
const GIF_KEY = 'expo.gif.enabled';
const WEBP_KEY = 'expo.webp.enabled';

/** Comment marker so the generated entries are traceable back to this plugin. */
const COMMENT =
  'task 10.1 — no native gif/webp usage (WebView wrapper); keep Fresco decoders out of the APK';

/** The keys this plugin owns; used to strip any pre-existing entries first. */
const MANAGED_KEYS = new Set([GIF_KEY, WEBP_KEY]);

/**
 * Pure transform over a gradle-properties `modResults` array: strip any
 * existing entries for the managed keys (and a stale copy of our comment), then
 * append our comment + both flags forced to `false`. Returns a NEW array;
 * idempotent (applying it twice yields the same result).
 *
 * Exported for unit testing without running a full prebuild.
 */
function applyFrescoFlags(modResults) {
  const kept = modResults.filter((item) => {
    if (item.type === 'property' && MANAGED_KEYS.has(item.key)) return false;
    if (item.type === 'comment' && item.value === COMMENT) return false;
    return true;
  });

  return [
    ...kept,
    { type: 'comment', value: COMMENT },
    { type: 'property', key: GIF_KEY, value: 'false' },
    { type: 'property', key: WEBP_KEY, value: 'false' },
  ];
}

/**
 * Ensure expo.gif.enabled=false and expo.webp.enabled=false in
 * android/gradle.properties, overriding whatever prebuild regenerated.
 */
function withFrescoFlags(config) {
  return withGradleProperties(config, (config) => {
    config.modResults = applyFrescoFlags(config.modResults);
    return config;
  });
}

module.exports = withFrescoFlags;
module.exports.applyFrescoFlags = applyFrescoFlags;
module.exports.GIF_KEY = GIF_KEY;
module.exports.WEBP_KEY = WEBP_KEY;
module.exports.COMMENT = COMMENT;

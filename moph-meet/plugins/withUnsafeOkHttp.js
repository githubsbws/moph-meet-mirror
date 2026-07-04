// Feature: mobile-sdk53-upgrade (restore direct-login SSL fix as a durable plugin)
//
// ============================================================================
// SECURITY TRADEOFF — READ THIS
// ============================================================================
// This plugin installs a custom React Native OkHttp client
// (`UnsafeOkHttpClientFactory`) that TRUSTS ALL TLS CERTIFICATES and disables
// hostname verification (`hostnameVerifier { _, _ -> true }`). It exists to fix
// a direct-login SSL error against an endpoint whose certificate chain the
// device does not trust (self-signed / private CA).
//
// This DISABLES ALL TLS VERIFICATION for the app's network module — every HTTPS
// connection becomes vulnerable to man-in-the-middle (MITM) interception.
//
// TODO: Replace this blanket trust-all with a proper fix — a certificate
// allow-list (custom X509TrustManager that only trusts the specific server CA)
// or certificate pinning (OkHttp CertificatePinner) — so we keep normal TLS
// validation for every other host. Do NOT ship trust-all long-term.
// ============================================================================
//
// Why a config plugin (not files dropped into android/):
// `expo prebuild --clean` wipes and regenerates android/, which deleted the
// original hand-added OkHttpClientFactory.kt + MainApplication.kt patch
// (git 90e15ed). Implementing the change as a plugin makes it re-apply on every
// prebuild so it survives future regenerations.
//
// What it does on prebuild (android only):
//   1. withDangerousMod — writes OkHttpClientFactory.kt into
//      android/app/src/main/java/<package-path>/ (package path derived from the
//      android package, e.g. th.go.moph.meet -> th/go/moph/meet).
//   2. withMainApplication — injects the OkHttpClientProvider import and the
//      `OkHttpClientProvider.setOkHttpClientFactory(UnsafeOkHttpClientFactory())`
//      call as the first line of onCreate() (idempotent — skips if present).
//
// SCOPE (Requirement 10): only touches moph-meet/ (android/ via prebuild).

const fs = require('fs');
const path = require('path');
const {
  withDangerousMod,
  withMainApplication,
} = require('@expo/config-plugins');

/** Kotlin source for the trust-all OkHttp client factory (verbatim restore). */
function okHttpFactorySource(packageName) {
  return `package ${packageName}

import com.facebook.react.modules.network.OkHttpClientFactory
import com.facebook.react.modules.network.ReactCookieJarContainer
import okhttp3.OkHttpClient
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

class UnsafeOkHttpClientFactory : OkHttpClientFactory {
    override fun createNewNetworkModuleClient(): OkHttpClient {
        val trustAllCerts = arrayOf<TrustManager>(object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {}
            override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {}
            override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
        })

        val sslContext = SSLContext.getInstance("SSL")
        sslContext.init(null, trustAllCerts, java.security.SecureRandom())

        return OkHttpClient.Builder()
            .cookieJar(ReactCookieJarContainer())
            .sslSocketFactory(sslContext.socketFactory, trustAllCerts[0] as X509TrustManager)
            .hostnameVerifier { _, _ -> true }
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }
}
`;
}

const OKHTTP_IMPORT =
  'import com.facebook.react.modules.network.OkHttpClientProvider';
const OKHTTP_SETUP =
  'OkHttpClientProvider.setOkHttpClientFactory(UnsafeOkHttpClientFactory())';

/** Step 1: write OkHttpClientFactory.kt into the app's java package dir. */
function withOkHttpFactoryFile(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const packageName =
        config.android?.package ?? config.modResults?.package;
      if (!packageName) {
        throw new Error(
          '[withUnsafeOkHttp] android.package is not set in app config.'
        );
      }

      const packagePath = packageName.replace(/\./g, path.sep);
      const javaDir = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        packagePath
      );
      fs.mkdirSync(javaDir, { recursive: true });
      fs.writeFileSync(
        path.join(javaDir, 'OkHttpClientFactory.kt'),
        okHttpFactorySource(packageName),
        'utf8'
      );
      return config;
    },
  ]);
}

/** Step 2: inject the import + setOkHttpClientFactory call into MainApplication. */
function withMainApplicationPatch(config) {
  return withMainApplication(config, (config) => {
    let contents = config.modResults.contents;

    // Only Kotlin MainApplication is expected for this app (RN 0.79 / SDK 53).
    // Idempotent: do nothing if the setup call is already present.
    if (contents.includes(OKHTTP_SETUP)) {
      return config;
    }

    // Inject the import after the package declaration (idempotent).
    if (!contents.includes(OKHTTP_IMPORT)) {
      contents = contents.replace(
        /^(package [^\n]+\n)/,
        `$1\n${OKHTTP_IMPORT}\n`
      );
    }

    // Inject the factory setup as the first line inside onCreate(), right after
    // super.onCreate() and before SoLoader.init(...).
    const onCreateRe = /(override fun onCreate\(\) \{\s*\n\s*super\.onCreate\(\)\n)/;
    if (onCreateRe.test(contents)) {
      contents = contents.replace(
        onCreateRe,
        `$1    ${OKHTTP_SETUP}\n`
      );
    } else {
      throw new Error(
        '[withUnsafeOkHttp] could not locate onCreate()/super.onCreate() in MainApplication.'
      );
    }

    config.modResults.contents = contents;
    return config;
  });
}

/** Composed plugin. */
module.exports = function withUnsafeOkHttp(config) {
  config = withOkHttpFactoryFile(config);
  config = withMainApplicationPatch(config);
  return config;
};

import { useEffect, useRef, useState } from 'react';
import { Platform, BackHandler, StatusBar, SafeAreaView, StyleSheet, ActivityIndicator, View, Text } from 'react-native';
import WebView, { WebViewNavigation } from 'react-native-webview';
import * as SplashScreen from 'expo-splash-screen';
import Constants from 'expo-constants';

SplashScreen.preventAutoHideAsync();

// ── Configuration ──────────────────────────────────────────────────────────────
const APP_URL = __DEV__
  ? 'http://192.168.1.100:3001'    // dev — change to your local IP
  : 'https://moph-meet.moph.go.th'; // production

// Allowed origins for navigation (stay in-app)
const ALLOWED_HOSTS = [
  'moph-meet.moph.go.th',
  'moph-meetingroom.moph.go.th',
  'moph.id.th',
  'provider.id.th',
  'localhost',
  '192.168.',
];

// ── Root Layout (WebView shell) ────────────────────────────────────────────────
export default function RootLayout() {
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Hide splash when WebView first loads
  const onFirstLoad = () => {
    setIsLoading(false);
    SplashScreen.hideAsync();
  };

  // Android hardware back button → WebView back
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    });
    return () => handler.remove();
  }, [canGoBack]);

  const onNavigationStateChange = (nav: WebViewNavigation) => {
    setCanGoBack(nav.canGoBack);
  };

  // Only allow navigation to our domains
  const onShouldStartLoadWithRequest = (request: { url: string }) => {
    const url = request.url.toLowerCase();
    if (url.startsWith('tel:') || url.startsWith('mailto:') || url.startsWith('sms:')) return true;
    return ALLOWED_HOSTS.some((host) => url.includes(host));
  };

  // Inject JS to pass native info to web app
  const injectedJS = `
    window.__MOPH_MEET_NATIVE__ = true;
    window.__MOPH_MEET_PLATFORM__ = '${Platform.OS}';
    window.__MOPH_MEET_VERSION__ = '${Constants.expoConfig?.version || '1.1.0'}';
    true;
  `;

  if (hasError) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorIcon}>📡</Text>
        <Text style={styles.errorTitle}>ไม่สามารถเชื่อมต่อได้</Text>
        <Text style={styles.errorText}>กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต</Text>
        <Text
          style={styles.retryBtn}
          onPress={() => {
            setHasError(false);
            setIsLoading(true);
            webViewRef.current?.reload();
          }}>
          🔄 ลองใหม่
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1b7a43" />
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#1b7a43" />
          <Text style={styles.loadingText}>กำลังโหลด MOPH Meet...</Text>
        </View>
      )}
      <WebView
        ref={webViewRef}
        source={{ uri: APP_URL }}
        style={styles.webview}
        onLoad={onFirstLoad}
        onError={() => setHasError(true)}
        onHttpError={() => setHasError(true)}
        onNavigationStateChange={onNavigationStateChange}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        injectedJavaScript={injectedJS}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState={false}
        allowsBackForwardNavigationGestures
        mediaCapturePermissionGrantType="grant"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1b7a43' },
  webview: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: { marginTop: 12, fontSize: 16, color: '#1b7a43', fontWeight: '500' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', padding: 32 },
  errorIcon: { fontSize: 48, marginBottom: 16 },
  errorTitle: { fontSize: 20, fontWeight: '700', color: '#1e293b', marginBottom: 8 },
  errorText: { fontSize: 14, color: '#64748b', textAlign: 'center', marginBottom: 24 },
  retryBtn: { fontSize: 16, color: '#1b7a43', fontWeight: '600', padding: 12 },
});

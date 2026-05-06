import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Image, SafeAreaView, Alert, Platform,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { saveAuth, loadToken } from '../constants/storage';
import { providerIdOAuthUrl, API_BASE } from '../constants/api';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);

  // Auto-navigate if already logged in
  useEffect(() => {
    loadToken().then(tok => {
      if (tok) router.replace('/dashboard');
      else setLoading(false);
    });
  }, []);

  // Handle deep-link callback: mophmeet://auth?token=...&user=...
  useEffect(() => {
    const sub = Linking.addEventListener('url', handleDeepLink);
    return () => sub.remove();
  }, []);

  async function handleDeepLink({ url }: { url: string }) {
    if (!url.startsWith('mophmeet://auth')) return;
    const { queryParams } = Linking.parse(url);
    const token = queryParams?.token as string | undefined;
    const userRaw = queryParams?.user as string | undefined;
    if (!token) {
      setAuthLoading(false);
      Alert.alert('เข้าสู่ระบบไม่สำเร็จ', 'ไม่พบ token กรุณาลองใหม่');
      return;
    }
    try {
      const user = userRaw ? JSON.parse(decodeURIComponent(userRaw)) : {};
      await saveAuth(decodeURIComponent(token), user);
      router.replace('/dashboard');
    } catch {
      setAuthLoading(false);
      Alert.alert('เข้าสู่ระบบไม่สำเร็จ', 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    }
  }

  async function handleProviderIdLogin() {
    setAuthLoading(true);
    try {
      const result = await WebBrowser.openAuthSessionAsync(
        providerIdOAuthUrl(),
        'mophmeet://',
      );
      // If user cancelled (no deep-link fired), reset loading
      if (result.type !== 'success') setAuthLoading(false);
    } catch (err) {
      setAuthLoading(false);
      Alert.alert('เกิดข้อผิดพลาด', String(err));
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={GREEN} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.bg}>
      <View style={styles.card}>
        {/* Logo */}
        <Image
          source={require('../assets/images/icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.appName}>MOPH Meet</Text>
        <Text style={styles.subtitle}>ระบบแพทย์ทางไกล กระทรวงสาธารณสุข</Text>

        {/* Provider ID login */}
        <TouchableOpacity
          style={[styles.btn, authLoading && styles.btnDisabled]}
          onPress={handleProviderIdLogin}
          disabled={authLoading}
          activeOpacity={0.8}
        >
          {authLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.btnText}>เข้าสู่ระบบด้วย Provider ID</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.hint}>ผู้ป่วยสามารถใช้ลิงก์นัดหมายที่ได้รับจากเจ้าหน้าที่</Text>
      </View>
    </SafeAreaView>
  );
}

const GREEN = '#1b7a43';

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#f0faf4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    width: '88%',
    maxWidth: 380,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  logo: { width: 96, height: 96, marginBottom: 12 },
  appName: { fontSize: 22, fontWeight: '700', color: GREEN, marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 28 },
  btn: {
    backgroundColor: GREEN,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
    minHeight: 48,
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  hint: { fontSize: 12, color: '#9ca3af', textAlign: 'center' },
});

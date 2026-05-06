import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { saveAuth } from '../constants/storage';

SplashScreen.preventAutoHideAsync();

// ── Handle Provider ID OAuth deep-link: mophmeet://auth?token=...&user=...
async function handleUrl({ url }: { url: string }) {
  if (!url?.startsWith('mophmeet://auth')) return;
  const { queryParams } = Linking.parse(url);
  const token   = queryParams?.token as string | undefined;
  const userRaw = queryParams?.user  as string | undefined;
  if (!token) return;
  try {
    const user = userRaw ? JSON.parse(decodeURIComponent(userRaw)) : {};
    await saveAuth(decodeURIComponent(token), user);
    router.replace('/dashboard');
  } catch (_) {}
}

export default function RootLayout() {
  useEffect(() => {
    // Deep-link while app is open
    const sub = Linking.addEventListener('url', handleUrl);
    // Deep-link on cold start
    Linking.getInitialURL().then(url => { if (url) handleUrl({ url }); });
    // Hide splash
    SplashScreen.hideAsync();
    return () => sub.remove();
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index"      options={{ animation: 'fade' }} />
      <Stack.Screen name="dashboard"  options={{ animation: 'fade' }} />
      <Stack.Screen name="exam/[id]"  options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="meet/[id]"  options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}

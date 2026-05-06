import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'mophmeet_token';
const USER_KEY  = 'mophmeet_user';

// expo-secure-store is not available on web — fall back to localStorage
const isWeb = Platform.OS === 'web';

async function setItem(key: string, value: string) {
  if (isWeb) { localStorage.setItem(key, value); return; }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (isWeb) return localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function removeItem(key: string) {
  if (isWeb) { localStorage.removeItem(key); return; }
  await SecureStore.deleteItemAsync(key);
}

export async function saveAuth(token: string, user: object) {
  await setItem(TOKEN_KEY, token);
  await setItem(USER_KEY, JSON.stringify(user));
}

export async function loadToken(): Promise<string | null> {
  return getItem(TOKEN_KEY);
}

export async function loadUser(): Promise<any | null> {
  const raw = await getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function clearAuth() {
  await removeItem(TOKEN_KEY);
  await removeItem(USER_KEY);
}

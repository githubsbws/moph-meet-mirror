/**
 * Central icon component — replaces emoji with vector icons.
 * Uses @expo/vector-icons MaterialCommunityIcons (the same glyph set as Iconify's `mdi:`),
 * already bundled with the project — no extra install or native rebuild required.
 *
 * To switch to react-native-iconify later, only this file needs changing.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ComponentProps } from 'react';

type MdiName = ComponentProps<typeof MaterialCommunityIcons>['name'];

// Semantic name → mdi glyph (mirrors Iconify mdi: set)
const MAP: Record<string, MdiName> = {
  hospital:     'hospital-building',
  exam:         'stethoscope',
  meet:         'video',
  video:        'video',
  vitals:       'heart-pulse',
  device:       'bluetooth',
  bluetooth:    'bluetooth',
  stats:        'chart-bar',
  logout:       'logout',
  edit:         'pencil',
  search:       'magnify',
  calendar:     'calendar-month',
  next:         'play',
  add:          'plus',
  invite:       'account-plus',
  share:        'share-variant',
  back:         'chevron-left',
  email:        'email-outline',
  idcard:       'card-account-details-outline',
  thaid:        'card-account-details',
  providerid:   'shield-account',
  user:         'account',
  clock:        'clock-outline',
  refresh:      'refresh',
  save:         'content-save',
  scan:         'bluetooth-connect',
};

export type IconName = keyof typeof MAP;

export function Icon({
  name, size = 20, color = '#1b7a43', style,
}: { name: IconName; size?: number; color?: string; style?: any }) {
  return <MaterialCommunityIcons name={MAP[name] || 'circle-small'} size={size} color={color} style={style} />;
}

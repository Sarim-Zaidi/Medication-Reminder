/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

/**
 * Application-specific color palette
 * Extracted from component stylesheets to ensure consistency
 */
export const AppColors = {
  // Primary colors
  primary: '#0d9488',
  primaryLight: '#14b8a6',
  primaryDark: '#0f766e',
  
  // Secondary/accent colors
  accent: '#facc15',
  accentLight: '#fde68a',
  
  // Status colors
  success: '#22c55e',
  successDark: '#16a34a',
  danger: '#ef4444',
  dangerDark: '#dc2626',
  warning: '#f59e0b',
  warningDark: '#d97706',
  
  // Background colors
  backgroundLight: '#f5f5f4',
  backgroundDark: '#0f172a',
  cardLight: '#FFFFFF',
  cardDark: '#1e293b',
  heroBackground: '#eff6ff',
  
  // Text colors
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#64748b',
  textQuaternary: '#94a3b8',
  textLight: '#FFFFFF',
  textGray: '#6b7280',
  textMuted: '#9ca3af',
  
  // Border colors
  border: '#E2E8F0',
  borderDark: '#CBD5E1',
  borderActive: '#334155',
  
  // State-specific colors
  taken: '#DCFCE7',
  takenBorder: '#166534',
  takenText: '#166534',
  missed: '#FEF2F2',
  missedBorder: '#DC2626',
  missedBackground: '#FEE2E2',
  
  // Pastel colors for medication avatars
  avatarColors: [
    '#FECACA', // Soft Red
    '#FED7AA', // Warm Orange
    '#FDE68A', // Soft Yellow
    '#D9F99D', // Light Lime
    '#A7F3D0', // Mint Green
    '#A5F3FC', // Teal
    '#DDD6FE', // Pastel Purple
    '#FBCFE8', // Pink
    '#FCA5A5', // Coral
    '#FCD34D', // Golden
  ] as const,
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

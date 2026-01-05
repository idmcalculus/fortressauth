/**
 * FortressAuth Design System - Design Tokens for React Native
 * Adapted from shared/styles/design-tokens.css for React Native StyleSheet.
 *
 * Usage: Import from './styles/designTokens'
 */

export const colors = {
  // Primary palette
  primary: {
    50: '#e6f7f6',
    100: '#ccefed',
    200: '#99dfdb',
    300: '#66cfc9',
    400: '#4ecdc4',
    500: '#44a08d',
    600: '#3a8a79',
    700: '#2f7365',
    800: '#255d51',
    900: '#1a463d',
  },

  // Background colors
  bg: {
    primary: '#0d1b2a',
    secondary: '#1e3a5f',
    tertiary: 'rgba(255, 255, 255, 0.1)',
    input: 'rgba(255, 255, 255, 0.05)',
    overlay: 'rgba(0, 0, 0, 0.7)',
  },

  // Text colors
  text: {
    primary: '#f8f9fa',
    secondary: '#a0aec0',
    muted: '#718096',
    accent: '#4ecdc4',
  },

  // Semantic colors
  success: '#48bb78',
  successBg: 'rgba(72, 187, 120, 0.1)',
  error: '#fc8181',
  errorBg: 'rgba(252, 129, 129, 0.1)',
  warning: '#f6ad55',
  warningBg: 'rgba(246, 173, 85, 0.1)',
  info: '#63b3ed',
  infoBg: 'rgba(99, 179, 237, 0.1)',

  // Border colors
  border: {
    primary: 'rgba(255, 255, 255, 0.2)',
    secondary: 'rgba(255, 255, 255, 0.1)',
    focus: '#4ecdc4',
    error: '#fc8181',
  },
};

export const typography = {
  fontFamily: {
    base: 'System', // React Native uses system font by default
  },
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
  },
  fontWeight: {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
};

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 5,
  },
  glow: {
    shadowColor: '#4ecdc4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
};

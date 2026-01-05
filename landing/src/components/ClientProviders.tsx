'use client';

import { ThemeProvider } from './ThemeProvider';

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

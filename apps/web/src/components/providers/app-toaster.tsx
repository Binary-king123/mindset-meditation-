'use client';

import { useTheme } from 'next-themes';
import { Toaster } from 'sonner';

/**
 * `theme="system"` on Toaster ignores the app's own theme state (ThemeProvider
 * has enableSystem={false}), so toasts could render dark on a light page or
 * vice versa. Follow next-themes' resolved value instead.
 */
export function AppToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="bottom-right"
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      richColors
      closeButton
    />
  );
}

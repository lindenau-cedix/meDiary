import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, useTheme } from './lib/theme';
import { ToasterProvider } from './components/Toaster';
import { initNative } from './lib/native';
import { AppShell } from './components/AppShell';
import { QuickEntryScreen } from './screens/QuickEntryScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { PlanScreen } from './screens/PlanScreen';
import { TrendsScreen } from './screens/TrendsScreen';
import { SettingsScreen } from './screens/SettingsScreen';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 10_000 },
  },
});

function NativeInit() {
  const { resolved } = useTheme();
  useEffect(() => {
    initNative(resolved);
  }, [resolved]);
  return null;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToasterProvider>
          <NativeInit />
          <HashRouter>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<QuickEntryScreen />} />
                <Route path="verlauf" element={<HistoryScreen />} />
                <Route path="plan" element={<PlanScreen />} />
                <Route path="werte" element={<TrendsScreen />} />
                <Route path="einstellungen" element={<SettingsScreen />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </HashRouter>
        </ToasterProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

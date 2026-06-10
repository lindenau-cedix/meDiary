import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.mediary',
  appName: 'meDiary',
  webDir: 'dist',
  backgroundColor: '#151310',
  android: {
    backgroundColor: '#151310',
    // Erlaubt Klartext-HTTP zu einem selbst gehosteten Server im Heimnetz.
    // Für Produktion HTTPS bevorzugen.
    allowMixedContent: true,
  },
  server: {
    androidScheme: 'https',
    // Klartext-HTTP-Server (z. B. http://192.168.x.x:4000) zulassen:
    cleartext: true,
  },
};

export default config;

import { existsSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  appType: 'spa',
  base: './',
  define: {
    // Android push needs Firebase; registering without google-services.json crashes the app.
    __ANDROID_FCM__: JSON.stringify(existsSync('android/app/google-services.json')),
  },
});

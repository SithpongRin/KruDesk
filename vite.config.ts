import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  base: '/KruDesk/',
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['pwa-192x192.png', 'pwa-512x512.png', 'fonts/**/*', 'images/**/*'],
      manifest: {
        name: 'KruDesk — ជំនួយការគ្រូបន្ទុកថ្នាក់',
        short_name: 'KruDesk',
        description:
          'កម្មវិធីគ្រប់គ្រងថ្នាក់រៀន សិស្ស បញ្ជីហៅឈ្មោះ បញ្ជីពិន្ទុ និងកាតសិស្សសម្រាប់គ្រូបន្ទុកថ្នាក់ (Offline ១០០%)',
        theme_color: '#0071e3',
        background_color: '#f5f5f7',
        display: 'standalone',
        orientation: 'any',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,ttf,woff,woff2}'],
        navigateFallbackDenylist: [/^\/KruDesk\/sw\.js$/, /^\/KruDesk\/workbox-/],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'zustand'],
          'vendor-db': ['dexie', 'dexie-react-hooks', 'zod'],
        },
      },
    },
  },
});

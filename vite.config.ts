import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { validateVercelBuildEnv } from './build/validateVercelBuildEnv';

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')) as {
  version: string;
};

const appBase = process.env.VERCEL ? '/' : '/KruDesk/';

function resolveCommit(): string {
  const fromCi = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA)?.slice(0, 7);
  if (fromCi) return fromCi;
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  validateVercelBuildEnv(env);

  return {
    base: appBase,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(resolveCommit()),
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
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
        start_url: appBase,
        scope: appBase,
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
        navigateFallbackDenylist: [
          /^\/__\//,
          /^\/(?:KruDesk\/)?sw\.js$/,
          /^\/(?:KruDesk\/)?workbox-/,
        ],
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
  };
});

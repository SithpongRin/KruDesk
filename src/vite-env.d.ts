/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** package.json version, injected by vite.config.ts `define`. */
declare const __APP_VERSION__: string;
/** Short git commit of the build (GITHUB_SHA on CI), injected by vite.config.ts `define`. */
declare const __APP_COMMIT__: string;
/** ISO time of the build, injected by vite.config.ts `define`. */
declare const __APP_BUILD_TIME__: string;

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// On Vercel the web app is mounted at /app (see ../vercel.json). Services receive the original
// request path, so the build lives in dist/app/ with /app/ URLs. Everywhere else (local dev,
// and the plugin build that embeds the UI) it stays relative.
const onVercel = !!process.env.VERCEL;

export default defineConfig({
  base: onVercel ? '/app/' : './',
  build: { outDir: onVercel ? 'dist/app' : 'dist', emptyOutDir: true },
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});

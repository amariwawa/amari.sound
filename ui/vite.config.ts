import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// On Vercel the web app is mounted at /app (see ../vercel.json). Services receive the original
// request path, so the build lives in dist/app/ with /app/ URLs. Everywhere else (local dev,
// and `--mode plugin`, the build embedded in the JUCE plugin) it stays relative.
export default defineConfig(({ mode }) => {
  const onVercel = !!process.env.VERCEL && mode !== 'plugin';
  return {
    base: onVercel ? '/app/' : './',
    build: {
      outDir: mode === 'plugin' ? 'dist-plugin' : onVercel ? 'dist/app' : 'dist',
      emptyOutDir: true,
    },
    plugins: [react(), tailwindcss()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      // same /api path as production (Vercel "stems" service) → local uvicorn stem server
      proxy: { '/api': 'http://127.0.0.1:8765' },
    },
  };
});

import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5174, strictPort: false, open: false },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'] }
      }
    }
  }
});

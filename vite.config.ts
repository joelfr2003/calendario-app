import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BASE lo pone el workflow de GitHub (/nombre-del-repo/). En local es "/".
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  build: { target: 'es2020', sourcemap: false },
});

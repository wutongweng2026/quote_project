import { defineConfig } from 'vite';
// @ts-ignore
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      // @ts-ignore
      '@': path.resolve(__dirname, './'),
    },
  },
});

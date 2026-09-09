import { defineConfig } from 'vite';

export default defineConfig({
  base: '/printlab-m4/',
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 600,
    sourcemap: false,
    rolldownOptions: {
      input: {
        main: new URL('./index.html', import.meta.url).pathname,
        teacher: new URL('./teacher/index.html', import.meta.url).pathname,
        help: new URL('./help/index.html', import.meta.url).pathname,
      },
      output: {
        codeSplitting: {
          groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }],
        },
      },
    },
  },
});

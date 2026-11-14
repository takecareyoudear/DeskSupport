import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq, req) => {
            // Translate only same-origin dev requests; foreign origins remain rejected.
            if (req.headers.origin === `http://${req.headers.host}`) {
              proxyReq.setHeader('origin', 'http://localhost:5173');
            }
          });
        },
      },
    },
  },
});

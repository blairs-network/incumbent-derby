import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite configuration for the React frontend.  The development server proxies
// API calls to the backend running on port 8000.

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/derbies': 'http://localhost:8000',
    },
  },
});
import { defineConfig } from 'vite';
import { resolve } from 'path';

// Multi-page build so admin HTML files are included in dist
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        adminScan: resolve(__dirname, 'admin-scan.html'),
        adminPlanning: resolve(__dirname, 'admin-planning.html'),
        adminPasswords: resolve(__dirname, 'admin-passwords.html'),
        adminStats: resolve(__dirname, 'admin-stats.html'),
        adminLunch: resolve(__dirname, 'admin-lunch.html'),
      },
    }
  }
});

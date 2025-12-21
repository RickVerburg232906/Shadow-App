import { copyFileSync } from 'fs';
import { join } from 'path';

const distDir = 'dist';

// Copy static files to dist
copyFileSync('manifest.webmanifest', join(distDir, 'manifest.webmanifest'));
copyFileSync('sw.js', join(distDir, 'sw.js'));
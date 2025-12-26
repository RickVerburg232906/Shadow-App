import { copyFileSync, existsSync, mkdirSync, cpSync } from 'fs';
import { join } from 'path';

const distDir = 'dist';

// Ensure dist exists
if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });

// Copy manifest and service worker
try { copyFileSync('manifest.webmanifest', join(distDir, 'manifest.webmanifest')); } catch (e) { /* ignore */ }
try { copyFileSync('sw.js', join(distDir, 'sw.js')); } catch (e) { /* ignore */ }

// Copy entire assets directory (if present) to dist/assets
const assetsSrc = 'assets';
const assetsDest = join(distDir, 'assets');
try {
	if (existsSync(assetsSrc)) {
		// Node 16.7+ supports cpSync; this will copy recursively
		cpSync(assetsSrc, assetsDest, { recursive: true });
	}
} catch (e) {
	// Fallback: ignore errors but warn on console during build
	console.warn('copy-static: failed to copy assets directory', e && e.message ? e.message : e);
}

// Also copy the `new-ui` directory into the dist so static deploys (e.g. Vercel)
const newUiSrc = 'new-ui';
const newUiDest = join(distDir, 'new-ui');
try {
    if (existsSync(newUiSrc)) {
        cpSync(newUiSrc, newUiDest, { recursive: true });
    }
} catch (e) {
    console.warn('copy-static: failed to copy new-ui directory', e && e.message ? e.message : e);
}
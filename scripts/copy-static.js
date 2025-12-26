import { copyFileSync, existsSync, mkdirSync, cpSync } from 'fs';
import { join } from 'path';

const distDir = 'dist';

// Ensure dist exists
if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });

// Copy manifest and service worker
try { copyFileSync('manifest.webmanifest', join(distDir, 'manifest.webmanifest')); } catch (e) { /* ignore */ }
try { copyFileSync('sw.js', join(distDir, 'sw.js')); } catch (e) { /* ignore */ }
// Copy root stylesheet so admin-ui and lid-ui can reference ../style.css -> /style.css
try { copyFileSync('style.css', join(distDir, 'style.css')); } catch (e) { /* ignore */ }

// Copy root JS modules that admin-ui and lid-ui expect at the webroot (e.g. ../firestore.js)
const rootScripts = ['firestore.js', 'admin.js', 'member.js', 'scanner.js'];
for (const s of rootScripts) {
	try {
		if (existsSync(s)) copyFileSync(s, join(distDir, s));
	} catch (e) { console.warn('copy-static: failed to copy root script', s, e && e.message ? e.message : e); }
}

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

// Also copy the `new-ui` build output into the dist so static deploys (e.g. Vercel).
// Prefer a built `new-ui/dist` directory; if that's not present, fall back to copying the source `new-ui` folder.
const newUiSrc = 'new-ui';
const newUiBuild = join(newUiSrc, 'dist');
const newUiDest = join(distDir, 'new-ui');
try {
	if (existsSync(newUiBuild)) {
		cpSync(newUiBuild, newUiDest, { recursive: true });
	} else if (existsSync(newUiSrc)) {
		cpSync(newUiSrc, newUiDest, { recursive: true });
	}
} catch (e) {
	console.warn('copy-static: failed to copy new-ui directory or build output', e && e.message ? e.message : e);
}

// Copy admin-ui and lid-ui static folders into dist so their pages are available on Vercel
const uiDirs = ['admin-ui', 'lid-ui'];
for (const d of uiDirs) {
	try {
		const src = d;
		const dest = join(distDir, d);
		if (existsSync(src)) {
			cpSync(src, dest, { recursive: true });
		}
	} catch (e) {
		console.warn(`copy-static: failed to copy ${d} directory`, e && e.message ? e.message : e);
	}

// Copy entire `src` directory into dist/src so all modules are available at /src/*
try {
	const srcDirAll = 'src';
	const destSrcDir = join(distDir, 'src');
	if (existsSync(srcDirAll)) {
		if (!existsSync(destSrcDir)) mkdirSync(destSrcDir, { recursive: true });
		cpSync(srcDirAll, destSrcDir, { recursive: true });
	}
} catch (e) { console.warn('copy-static: failed to copy src directory', e && e.message ? e.message : e); }
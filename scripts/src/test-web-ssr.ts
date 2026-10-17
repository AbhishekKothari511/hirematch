import fs from 'fs';
import path from 'path';

async function runWebBuildMeasurements() {
  console.log('====================================================');
  console.log('🧪 HireMatch Phase 5 Next.js Web & SSR Measurement Suite');
  console.log('====================================================\n');

  const nextDir = path.resolve(__dirname, '../../apps/web/.next');
  if (!fs.existsSync(nextDir)) {
    throw new Error(`Next.js build directory not found at ${nextDir}. Run 'npm run build --workspace=@hirematch/web' first.`);
  }

  // 1. Inspect Server-Rendered Pages Manifest
  const pagesManifestPath = path.join(nextDir, 'server/app-paths-manifest.json');
  let routesCount = 0;
  let routesList: string[] = [];

  if (fs.existsSync(pagesManifestPath)) {
    const rawManifest = fs.readFileSync(pagesManifestPath, 'utf-8');
    const manifest = JSON.parse(rawManifest);
    routesList = Object.keys(manifest);
    routesCount = routesList.length;
  }

  console.log('1️⃣  Server-Rendered Routes Verification...');
  console.log(`   - Compiled Routes Count: ${routesCount}`);
  routesList.forEach((r) => console.log(`     ✓ Route: ${r}`));

  // 2. Measure SSR HTML Sizes
  console.log('\n2️⃣  Measuring Server-Rendered HTML Chunk Sizes...');
  const appServerDir = path.join(nextDir, 'server/app');
  let totalHtmlBytes = 0;

  function scanDir(dir: string) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        scanDir(full);
      } else if (f.endsWith('.html')) {
        totalHtmlBytes += stat.size;
        console.log(`   - SSR Page: ${path.relative(appServerDir, full)} (${(stat.size / 1024).toFixed(2)} KB)`);
      }
    }
  }

  if (fs.existsSync(appServerDir)) {
    scanDir(appServerDir);
  }

  console.log(`   - Total Pre-rendered HTML Footprint: ${(totalHtmlBytes / 1024).toFixed(2)} KB`);

  // 3. Measure Static Asset Footprint
  console.log('\n3️⃣  Measuring Static Client Bundle Footprint...');
  const staticDir = path.join(nextDir, 'static');
  let staticJsBytes = 0;
  let staticChunksCount = 0;

  function scanStatic(dir: string) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        scanStatic(full);
      } else if (f.endsWith('.js')) {
        staticJsBytes += stat.size;
        staticChunksCount++;
      }
    }
  }

  if (fs.existsSync(staticDir)) {
    scanStatic(staticDir);
  }

  console.log(`   - Static JavaScript Chunks: ${staticChunksCount} files`);
  console.log(`   - Total Bundled Client JS: ${(staticJsBytes / 1024).toFixed(2)} KB`);

  console.log('\n====================================================');
  console.log('✅ NEXT.JS WEB SSR BUILD MEASUREMENTS COMPLETE');
  console.log('====================================================');
}

runWebBuildMeasurements().catch((err) => {
  console.error('Measurement Error:', err);
  process.exit(1);
});

// electron-builder afterPack hook
// Copies Next.js static export (out/) to app Resources/renderer
// Works on macOS (.app bundle) and Windows (unpacked dir)
const path = require('path');
const fs = require('fs');

exports.default = async function afterPack(context) {
  const appOutDir = context.appOutDir;
  const platform = context.packager.platform.name;

  let resourcesDir;
  if (platform === 'mac') {
    resourcesDir = path.join(appOutDir, 'Guitar AutoStomp.app', 'Contents', 'Resources');
  } else {
    // Windows / Linux: resources dir is at app root
    resourcesDir = path.join(appOutDir, 'resources');
  }

  const sourceDir = path.join(context.packager.projectDir, 'out');
  const destDir = path.join(resourcesDir, 'renderer');

  if (!fs.existsSync(sourceDir)) {
    console.log(`  • [afterPack] WARNING: Static export not found at ${sourceDir}. Run "next build" first.`);
    console.log(`  • [afterPack] Continuing without renderer files...`);
    return;
  }

  console.log(`  • [afterPack] Platform: ${platform}`);
  console.log(`  • [afterPack] Copying static export to ${destDir}`);

  // Ensure destination exists
  fs.mkdirSync(destDir, { recursive: true });

  // Copy recursively
  fs.cpSync(sourceDir, destDir, { recursive: true });

  console.log(`  • [afterPack] Done. Contents: ${fs.readdirSync(destDir).join(', ')}`);
};

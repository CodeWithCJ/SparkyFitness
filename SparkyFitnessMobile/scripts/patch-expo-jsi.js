const fs = require('fs');
const path = require('path');

function findDirs(baseDir, targetName, results = []) {
  if (!fs.existsSync(baseDir)) return results;
  try {
    const files = fs.readdirSync(baseDir);
    for (const file of files) {
      const fullPath = path.join(baseDir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          if (file === targetName) {
            results.push(fullPath);
          } else if (file === '.pnpm' || file === 'node_modules' || (baseDir.includes('.pnpm') && !file.startsWith('.'))) {
            findDirs(fullPath, targetName, results);
          }
        }
      } catch (e) {
        // Skip permission errors or broken symlinks
      }
    }
  } catch (e) {
    // Skip unreadable directories
  }
  return results;
}

const rootDir = path.resolve(__dirname, '..', '..');
const mobileDir = path.resolve(__dirname, '..');

console.log('Searching for expo-modules-jsi directories...');
const paths = [
  ...findDirs(path.join(rootDir, 'node_modules'), 'expo-modules-jsi'),
  ...findDirs(path.join(mobileDir, 'node_modules'), 'expo-modules-jsi')
];

const uniquePaths = Array.from(new Set(paths));

if (uniquePaths.length === 0) {
  console.error('Could not find expo-modules-jsi directory!');
  process.exit(1);
}

function patchDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      patchDirectory(fullPath);
    } else if (file.endsWith('.swift')) {
      const isSendable = file.includes('HostFunctionContext') || 
                         file.includes('HostObjectContext') || 
                         file.includes('JavaScriptPropNameID') || 
                         file.includes('JavaScriptValue');
                         
      const regex = /(?:nonisolated\(unsafe\)\s+)*(?:(private|internal)\s+)?weak\s+(?:let|var)\s+runtime/g;
                         
      let content = fs.readFileSync(fullPath, 'utf8');
      if (content.match(regex)) {
        console.log(`Patching weak reference in: ${fullPath} (Sendable: ${isSendable})`);
        
        content = content.replace(regex, (match, accessModifier) => {
          const prefix = isSendable ? 'nonisolated(unsafe) ' : '';
          const access = accessModifier ? accessModifier + ' ' : '';
          return `${prefix}${access}weak var runtime`;
        });
        
        fs.writeFileSync(fullPath, content, 'utf8');
      }
    }
  }
}

for (const pkgPath of uniquePaths) {
  const sourcesDir = path.join(pkgPath, 'apple', 'Sources', 'ExpoModulesJSI');
  if (fs.existsSync(sourcesDir)) {
    console.log(`Found package at: ${pkgPath}`);
    patchDirectory(sourcesDir);
  }
}

console.log('Successfully patched all expo-modules-jsi Swift files with Sendable safety!');

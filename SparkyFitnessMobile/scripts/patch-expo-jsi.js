const fs = require('fs');
const path = require('path');

const mobileDir = path.resolve(__dirname, '..');

console.log('Searching for expo-modules-jsi directory...');
let pkgPath;
try {
  pkgPath = path.dirname(require.resolve('expo-modules-jsi/package.json', { paths: [mobileDir] }));
} catch (e) {
  console.warn('expo-modules-jsi not found via require.resolve. Skipping patch.');
  process.exit(0);
}

const uniquePaths = [pkgPath];

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

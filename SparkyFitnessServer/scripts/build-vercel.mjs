import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8')
);

const dependencyNames = Object.keys(packageJson.dependencies ?? {}).filter(
  (name) => name !== '@workspace/shared'
);

const external = dependencyNames.flatMap((name) => [name, `${name}/*`]);

await build({
  entryPoints: ['index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  outfile: 'dist/index.js',
  external,
  define: {
    'process.env.npm_package_version': JSON.stringify(packageJson.version),
  },
  sourcemap: true,
  logLevel: 'info',
});

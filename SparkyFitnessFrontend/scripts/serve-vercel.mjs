import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');
const indexPath = path.join(distDir, 'index.html');
const port = process.env.PORT ?? 3000;

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.mp4', 'video/mp4'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.webp', 'image/webp'],
]);

function resolveStaticPath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  const requestedPath = decodedPath === '/' ? '/index.html' : decodedPath;
  const normalizedPath = path
    .normalize(requestedPath)
    .replace(/^(\.\.[/\\])+/, '');
  const candidatePath = path.join(distDir, normalizedPath);

  if (!candidatePath.startsWith(distDir)) {
    return indexPath;
  }

  if (existsSync(candidatePath) && statSync(candidatePath).isFile()) {
    return candidatePath;
  }

  return indexPath;
}

createServer((req, res) => {
  try {
    const filePath = resolveStaticPath(req.url ?? '/');
    const extension = path.extname(filePath);
    const isAsset = filePath !== indexPath;

    res.statusCode = 200;
    res.setHeader(
      'Content-Type',
      contentTypes.get(extension) ?? 'application/octet-stream'
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Cache-Control',
      isAsset
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=0, must-revalidate'
    );

    createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Failed to serve frontend asset:', error);
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
}).listen(port, () => {
  console.log(`SparkyFitnessFrontend listening on port ${port}`);
});

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const host = process.argv.includes('--host') ? '0.0.0.0' : '127.0.0.1';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(root + sep) || pathname.split('/').some(part => part.startsWith('.'))) {
      res.writeHead(403).end('Acceso no permitido'); return;
    }
    if (!(await stat(path)).isFile()) throw new Error('missing');
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await readFile(path));
  } catch { res.writeHead(404).end('Archivo no encontrado'); }
}).listen(port, host, () => console.log(`Repite disponible en http://${host}:${port}`));

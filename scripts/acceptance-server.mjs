import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const directory = resolve('release/acceptance');
await mkdir(directory, { recursive: true });
const files = new Map([['/report','audio-report.json'], ['/wav','Altale-reconstruction.wav'], ['/mp3','Altale-reconstruction.mp3']]);
http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5173');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  if (req.method !== 'POST' || !files.has(req.url)) { res.writeHead(404).end(); return; }
  try {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 100 * 1024 * 1024) throw new Error('too large'); chunks.push(chunk); }
    const name = files.get(req.url);
    await writeFile(resolve(directory, name), Buffer.concat(chunks));
    console.log(`Saved ${name}: ${size} bytes`); res.end('saved');
  } catch (error) { res.writeHead(500).end(String(error)); }
}).listen(5174, '127.0.0.1', () => console.log('Acceptance artifacts: http://127.0.0.1:5174 → release/acceptance'));

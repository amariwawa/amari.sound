// Starts the Vite UI and, if installed, the local Demucs stem server.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../stems-server/', import.meta.url));
const py = `${root}.venv/bin/python`;
const kids = [];

if (existsSync(py)) kids.push(spawn(py, [`${root}server.py`], { stdio: 'inherit' }));
else console.log('\n[amarisound] stem server not installed — run `npm run stems:setup` once to enable the stem splitter\n');

kids.push(spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))], { stdio: 'inherit' }));

const stop = () => {
  kids.forEach((k) => k.kill('SIGTERM'));
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
kids.forEach((k) => k.on('exit', (code) => code && code !== 0 && console.log(`[amarisound] process exited with ${code}`)));

import { readdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
if (process.versions.node !== '24.11.0') throw new Error('Use Node v24.11.0 (nvm use).');
for (const dir of ['server', 'public', 'scripts', 'test', 'e2e', 'deploy']) {
  for (const name of await readdir(dir)) {
    if (/\.(?:js|cjs)$/.test(name)) execFileSync(process.execPath, ['--check', `${dir}/${name}`], { stdio: 'inherit' });
  }
}
for (const name of ['index.html', 'help.html']) {
  const html = await readFile(`public/${name}`, 'utf8');
  if (!html.includes('src="/form.js"') || !html.includes('href="/style.css"')) throw new Error(`Missing assets in ${name}`);
}
console.info('Node version, JavaScript syntax and static entry points checked. No bundling required.');

import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import yazl from 'yazl';

export async function officeFile(extra = {}, kind = 'docx') {
  const zip = new yazl.ZipFile();
  const [mainPart, contentType, content] = {
    docx: ['word/document.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>'],
    xlsx: ['xl/workbook.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>'],
    pptx: ['ppt/presentation.xml', 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml', '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>'],
  }[kind];
  zip.addBuffer(Buffer.from(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/${mainPart}" ContentType="${contentType}"/></Types>`), '[Content_Types].xml');
  zip.addBuffer(Buffer.from(content), mainPart);
  for (const [name, data] of Object.entries(extra)) zip.addBuffer(data, name);
  zip.end();
  const chunks = [];
  for await (const chunk of zip.outputStream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function temporaryMongo() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'scinteg-test-'));
  const portFinder = net.createServer();
  await new Promise(resolve => portFinder.listen(0, '127.0.0.1', resolve));
  const { port } = portFinder.address();
  await new Promise(resolve => portFinder.close(resolve));
  await mkdir(path.join(dir, 'db'));
  const child = spawn(process.env.MONGOD_BINARY || 'mongod', ['--dbpath', path.join(dir, 'db'), '--port', String(port), '--bind_ip', '127.0.0.1', '--quiet', '--nounixsocket'], { stdio: 'ignore' });
  let failed;
  child.on('error', error => { failed = error; });
  const stop = async () => {
    if (child.exitCode === null && child.pid) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
    await rm(dir, { recursive: true, force: true });
  };
  for (let i = 0; i < 100; i++) {
    if (failed || child.exitCode !== null) {
      await stop();
      throw new Error('Cannot start isolated MongoDB. Install mongod or set MONGOD_BINARY.', { cause: failed });
    }
    const ready = await new Promise(resolve => {
      const socket = net.connect(port, '127.0.0.1');
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => resolve(false));
    });
    if (ready) return { dir, uri: `mongodb://127.0.0.1:${port}/scintegform_test`, stop };
    await delay(100);
  }
  await stop();
  throw new Error('Isolated MongoDB did not start');
}

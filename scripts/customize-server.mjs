import { createServer } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import sharp from 'sharp';
import {
  MAX_ASSET_BYTES, PROJECT_ROOT, doctor, neutralConfiguration, projectPath, readConfiguration,
  resolveCustomAsset, synchronizeConfiguration, validateConfiguration, writeProjectFile
} from './customize-config.mjs';

const ASSET_ROLES = new Set(['icon', 'logo', 'extensionIcon']);
const UI_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.css', ['app.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']]
]);

function requestError(message, status = 400) { return Object.assign(new Error(message), { status }); }

async function readBody(request, limit) {
  if (Number(request.headers['content-length'] ?? 0) > limit) throw requestError('O envio excede o tamanho permitido.', 413);
  let length = 0;
  const chunks = [];
  for await (const chunk of request) {
    length += chunk.length;
    if (length > limit) throw requestError('O envio excede o tamanho permitido.', 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(request) {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json') throw requestError('Envie a configuração como JSON.', 415);
  try { return JSON.parse((await readBody(request, 32 * 1024)).toString('utf8')); } catch (error) {
    if (error.status) throw error;
    throw requestError('O conteúdo JSON é inválido.');
  }
}

function openUrl(url) {
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const child = spawn(command, args, { detached: true, windowsHide: true, stdio: 'ignore' });
  child.on('error', () => console.error('Não foi possível abrir o navegador padrão. Execute o personalizador em uma sessão com navegador disponível.'));
  child.unref();
}

export async function startCustomizer({ root = PROJECT_ROOT, openBrowser = true } = {}) {
  const token = randomBytes(32).toString('hex');
  let address = '';
  let buildProcess;
  let build = { running: false, status: 'idle', log: '', artifact: '' };
  const sensitiveValues = Object.entries(process.env)
    .filter(([name, value]) => /TOKEN|SECRET|PASSWORD|API_KEY|AUTHORIZATION/i.test(name) && value && value.length >= 6)
    .map(([, value]) => value);

  function appendLog(chunk) {
    let value = chunk.toString('utf8');
    for (const secret of sensitiveValues) value = value.split(secret).join('[oculto]');
    value = value.replace(/Bearer\s+[^\s]+/gi, 'Bearer [oculto]').replace(/https?:\/\/[^\s]+[?#][^\s]+/g, '[URL com parâmetros ocultos]');
    build.log = (build.log + value).slice(-24_000);
  }

  function beginBuild() {
    if (build.running) throw requestError('Já existe uma geração de instalador em andamento.', 409);
    const report = doctor(root);
    if (!report.ok) throw requestError('Corrija as pendências da verificação antes de gerar o instalador.', 422);
    const artifact = `release/${report.installer}`;
    projectPath(root, artifact);
    const started = Date.now();
    build = { running: true, status: 'running', log: 'Preparando o instalador Windows x64…\n', artifact: '' };
    buildProcess = spawn(process.execPath, ['scripts/package.mjs', '--platform', 'win32', '--arch', 'x64'], {
      cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: process.env
    });
    buildProcess.stdout.on('data', appendLog);
    buildProcess.stderr.on('data', appendLog);
    buildProcess.on('error', (error) => {
      appendLog(`Não foi possível iniciar o empacotamento: ${error.message}\n`);
      build.running = false;
      build.status = 'failed';
    });
    buildProcess.on('close', (code) => {
      build.running = false;
      build.status = 'failed';
      if (code === 0) {
        try {
          const info = statSync(projectPath(root, artifact));
          if (!info.isFile() || info.mtimeMs < started - 2000) throw new Error('O instalador novo não foi encontrado.');
          build.status = 'complete';
          build.artifact = artifact;
          appendLog(`\nInstalador concluído: ${report.installer}\n`);
        } catch (error) { appendLog(`${error.message}\n`); }
      } else appendLog('\nA geração falhou. Confira as mensagens acima.\n');
      buildProcess = undefined;
    });
  }

  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const reply = (status, value) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(value));
    };
    try {
      if (request.headers.host !== new URL(address).host) throw requestError('Origem não autorizada.', 403);
      const url = new URL(request.url, address);
      const ui = UI_FILES.get(url.pathname);
      if (request.method === 'GET' && ui) {
        response.writeHead(200, { 'Content-Type': ui[1] });
        response.end(readFileSync(projectPath(root, `customization/ui/${ui[0]}`)));
        return;
      }
      const supplied = request.headers['x-customize-token'];
      if (typeof supplied !== 'string' || !/^[0-9a-f]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))) {
        throw requestError('Esta sessão não está autorizada. Reabra o personalizador pelo projeto.', 403);
      }
      const origin = request.headers.origin;
      if ((origin && origin !== address) || (request.method !== 'GET' && origin !== address)) {
        throw requestError('Origem não autorizada.', 403);
      }
      if (request.method === 'GET' && url.pathname === '/api/config') return reply(200, { config: readConfiguration(root), build });
      if (request.method === 'GET' && url.pathname === '/api/template') return reply(200, neutralConfiguration());
      if (request.method === 'GET' && url.pathname === '/api/doctor') return reply(200, doctor(root));
      if (request.method === 'GET' && url.pathname === '/api/status') return reply(200, build);
      if (request.method === 'GET' && url.pathname.startsWith('/api/preview/')) {
        const role = url.pathname.slice('/api/preview/'.length);
        if (!ASSET_ROLES.has(role)) throw requestError('Imagem desconhecida.', 404);
        const config = readConfiguration(root);
        const file = resolveCustomAsset(config[role] || config.icon, root);
        if (!file) throw requestError('A marca padrão está em uso.', 404);
        const image = await sharp(readFileSync(file), { limitInputPixels: 16 * 1024 * 1024 }).resize(160, 160, { fit: 'inside' }).png().toBuffer();
        response.writeHead(200, { 'Content-Type': 'image/png' });
        response.end(image);
        return;
      }
      if (request.method !== 'POST') throw requestError('Endereço não encontrado.', 404);
      if (build.running) throw requestError('Aguarde a geração terminar para alterar a configuração.', 409);
      if (url.pathname === '/api/save') {
        const config = validateConfiguration(await readJson(request), root);
        if (build.running) throw requestError('Aguarde a geração terminar para alterar a configuração.', 409);
        synchronizeConfiguration(config, root, true);
        return reply(200, { config, message: 'Configuração salva e identidade sincronizada.' });
      }
      if (url.pathname === '/api/build') {
        const body = await readJson(request);
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) throw requestError('A geração não aceita comandos personalizados.');
        beginBuild();
        return reply(202, build);
      }
      if (url.pathname.startsWith('/api/assets/')) {
        const role = url.pathname.slice('/api/assets/'.length);
        if (!ASSET_ROLES.has(role)) throw requestError('Imagem desconhecida.', 404);
        const bytes = await readBody(request, MAX_ASSET_BYTES);
        let info;
        try { info = await sharp(bytes, { limitInputPixels: 16 * 1024 * 1024 }).metadata(); } catch { throw requestError('Use uma imagem PNG, JPEG ou WebP válida, com até 16 milhões de pixels.'); }
        if (!['png', 'jpeg', 'webp'].includes(info.format) || (info.pages ?? 1) !== 1) throw requestError('Use uma imagem PNG, JPEG ou WebP estática.');
        const extension = info.format === 'jpeg' ? 'jpg' : info.format;
        if (build.running) throw requestError('Aguarde a geração terminar para alterar as imagens.', 409);
        const asset = `assets/${role}-${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.${extension}`;
        writeProjectFile(`customization/${asset}`, bytes, root);
        return reply(200, { path: asset });
      }
      throw requestError('Endereço não encontrado.', 404);
    } catch (error) {
      if (!response.headersSent) reply(error.status ?? 400, { error: error.message });
      else response.end();
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  address = `http://127.0.0.1:${server.address().port}`;
  if (openBrowser) openUrl(`${address}/#${token}`);
  return {
    address, token, server,
    close: () => new Promise((resolve) => { server.close(resolve); server.closeIdleConnections(); })
  };
}

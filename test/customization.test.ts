import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error Os scripts de empacotamento são módulos JavaScript sem declarações TypeScript.
import { metadataUpdates, neutralConfiguration, projectPath, publicBranding, readConfiguration, resolveCustomAsset, synchronizeConfiguration, validateConfiguration, writeProjectFile } from '../scripts/customize-config.mjs';
// @ts-expect-error O servidor do personalizador usa o mesmo formato dos scripts de empacotamento.
import { startCustomizer } from '../scripts/customize-server.mjs';
// @ts-expect-error O parser YAML já é fornecido pelo empacotador.
import { load as loadYaml } from 'js-yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures: string[] = [];
const servers: Array<{ close: () => Promise<void> }> = [];

function fixture() {
  const base = projectPath(root, 'smoke');
  mkdirSync(base, { recursive: true });
  const directory = mkdtempSync(path.join(base, 'customization-'));
  fixtures.push(directory);
  for (const folder of ['customization', 'extension', 'scripts']) mkdirSync(path.join(directory, folder));
  for (const relative of ['package.json', 'package-lock.json', 'electron-builder.yml', 'extension/manifest.json', 'scripts/make-icon.mjs', 'scripts/customize-config.mjs']) {
    copyFileSync(path.join(root, relative), path.join(directory, relative));
  }
  writeFileSync(path.join(directory, 'customization/app.config.json'), JSON.stringify(neutralConfiguration()));
  return directory;
}

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
  for (const directory of fixtures.splice(0)) {
    const relative = path.relative(path.join(root, 'smoke'), directory);
    if (!relative.startsWith('customization-') || path.isAbsolute(relative) || relative.includes('..')) throw new Error('Diretório temporário fora do escopo.');
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('configuração central da distribuição', () => {
  it('deriva o produto e o instalador da configuração, sem um canal de atualização', () => {
    const config = readConfiguration(root);
    expect(config).not.toHaveProperty('updates');
    const builder = loadYaml(readFileSync(path.join(root, 'electron-builder.yml'), 'utf8'));
    expect(builder.productName).toBe(config.name);
    expect(builder.nsis.artifactName.replace('${arch}', 'x64').replace('${ext}', 'exe')).toBe(`${config.installerPrefix}-Setup-x64.exe`);
    expect(builder.nsis.installerLanguages).toEqual(['pt_BR']);
    expect(builder.nsis.language).toBe('1046');
    expect(builder.nsis.displayLanguageSelector).toBe(false);
  });

  it('oferece um modelo neutro sem introduzir uma segunda configuração ativa', () => {
    const config = neutralConfiguration();
    expect(config.name).toBe('Agente Local');
    config.publication.repository = 'equipe/publicacao';
    expect(validateConfiguration(config)).not.toHaveProperty('updates');
  });

  it.each([
    ['name', 'Nome/Inválido'], ['packageName', 123], ['appId', '../app'],
    ['executableName', 'CON'], ['installerPrefix', 'app;comando'], ['version', '1.0.999999'],
    ['homepageUrl', 'javascript:alert(1)'], ['repositoryUrl', 'https://user:senha@example.com/projeto']
  ])('recusa %s inválido sem gravar a configuração', (field, value) => {
    const config = { ...neutralConfiguration(), [field]: value };
    expect(() => validateConfiguration(config)).toThrow();
  });

  it('recusa campos secretos e a reintrodução de um canal de atualização', () => {
    expect(() => validateConfiguration({ ...neutralConfiguration(), apiKey: 'nao-gravar' })).toThrow(/campo não reconhecido/);
    expect(() => validateConfiguration({ ...neutralConfiguration(), updates: { enabled: true, repository: 'equipe/app' } })).toThrow(/campo não reconhecido/);
  });

  it('sincroniza somente a identidade e preserva recursos e permissões', () => {
    const directory = fixture();
    const config = readConfiguration(directory);
    const beforeManifest = JSON.parse(readFileSync(path.join(directory, 'extension/manifest.json'), 'utf8'));
    const beforeBuilder = loadYaml(readFileSync(path.join(directory, 'electron-builder.yml'), 'utf8'));
    expect(synchronizeConfiguration(config, directory).length).toBeGreaterThan(0);
    const manifest = JSON.parse(readFileSync(path.join(directory, 'extension/manifest.json'), 'utf8'));
    const builder = loadYaml(readFileSync(path.join(directory, 'electron-builder.yml'), 'utf8'));
    expect(manifest.version).toBe(config.version);
    expect(manifest.name).toBe(config.extensionName);
    expect(manifest.permissions).toEqual(beforeManifest.permissions);
    expect(manifest.host_permissions).toEqual(beforeManifest.host_permissions);
    expect(manifest.content_scripts.every((entry: { js: string[] }) => entry.js[0] === 'branding.js')).toBe(true);
    expect(builder.extraResources).toEqual(beforeBuilder.extraResources);
    expect(builder.win.files).toEqual(beforeBuilder.win.files);
    expect(builder.win.extraResources).toEqual(beforeBuilder.win.extraResources);
    expect(builder.asarUnpack).toEqual(beforeBuilder.asarUnpack);
    expect(builder.win.requestedExecutionLevel).toBe('asInvoker');
    expect(builder.nsis.deleteAppDataOnUninstall).toBe(false);
    expect(synchronizeConfiguration(config, directory)).toEqual([]);
    expect([...metadataUpdates(config, directory)].every(([relative, value]: [string, string]) => readFileSync(path.join(directory, relative), 'utf8') === value)).toBe(true);
    expect(readFileSync(path.join(directory, 'extension/branding.js'), 'utf8')).toContain(JSON.stringify(publicBranding(config), null, 2));
  });
});

describe('contenção dos arquivos de personalização', () => {
  it.each(['../fora.png', 'C:/fora.png', '//servidor/fora.png', 'assets/imagem.png:stream', 'assets/../fora.png'])('recusa o caminho %s', (relative) => {
    expect(() => resolveCustomAsset(relative, fixture())).toThrow();
  });

  it('recusa imagens e gravações que atravessam uma junção para fora do projeto', () => {
    const directory = fixture();
    const outside = fixture();
    writeFileSync(path.join(outside, 'imagem.png'), 'imagem original');
    symlinkSync(outside, path.join(directory, 'customization', 'link'), process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => resolveCustomAsset('link/imagem.png', directory)).toThrow(/fora do projeto/);
    expect(() => writeProjectFile('customization/link/imagem.png', 'alterada', directory)).toThrow(/fora do projeto/);
    expect(readFileSync(path.join(outside, 'imagem.png'), 'utf8')).toBe('imagem original');
  });

  it('recusa uma imagem ligada a outra pasta interna, fora de customization', () => {
    const directory = fixture();
    const other = path.join(directory, 'other');
    mkdirSync(other);
    writeFileSync(path.join(other, 'imagem.png'), 'imagem original');
    symlinkSync(other, path.join(directory, 'customization', 'link'), process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => resolveCustomAsset('link/imagem.png', directory)).toThrow(/dentro de customization/);
  });

  it('gera todos os tamanhos da marca neutra, incluindo logo e extensão', () => {
    const directory = fixture();
    const result = spawnSync(process.execPath, ['scripts/make-icon.mjs'], { cwd: directory, encoding: 'utf8', windowsHide: true });
    expect(result.status, result.stderr).toBe(0);
    const ico = readFileSync(path.join(directory, 'build/icon.ico'));
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(6);
    for (const relative of ['build/icon.png', 'build/runtime-icon.png', 'build/brand-logo.png', 'extension/icons/icon16.png', 'extension/icons/icon32.png', 'extension/icons/icon48.png', 'extension/icons/icon128.png']) {
      expect(readFileSync(path.join(directory, relative)).subarray(1, 4).toString()).toBe('PNG');
    }
  });
});

describe('acesso ao personalizador local', () => {
  async function start() {
    const directory = fixture();
    const server = await startCustomizer({ root: directory, openBrowser: false });
    servers.push(server);
    return { ...server, directory };
  }

  it('recusa gravação sem sessão, de outra origem e sem origem explícita', async () => {
    const { address, token, directory } = await start();
    const file = path.join(directory, 'customization/app.config.json');
    const original = readFileSync(file, 'utf8');
    const attempts: Array<Record<string, string>> = [
      { Origin: address },
      { Origin: 'https://externo.example', 'X-Customize-Token': token },
      { 'X-Customize-Token': token }
    ];
    for (const headers of attempts) {
      const response = await fetch(`${address}/api/save`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: original });
      expect(response.status).toBe(403);
      await response.arrayBuffer();
    }
    expect(readFileSync(file, 'utf8')).toBe(original);
  });

  it('aceita uma sessão local válida e não recebe comandos de build arbitrários', async () => {
    const { address, token, directory } = await start();
    const headers = { Origin: address, 'X-Customize-Token': token, 'Content-Type': 'application/json' };
    const config = neutralConfiguration();
    config.name = 'Aplicativo de Teste';
    const saved = await fetch(`${address}/api/save`, { method: 'POST', headers, body: JSON.stringify(config) });
    expect(saved.status).toBe(200);
    await saved.arrayBuffer();
    expect(readConfiguration(directory).name).toBe(config.name);
    const injected = await fetch(`${address}/api/build`, { method: 'POST', headers, body: JSON.stringify({ command: 'qualquer comando' }) });
    expect(injected.status).toBe(400);
    await injected.arrayBuffer();
    const status = await fetch(`${address}/api/status`, { headers });
    expect((await status.json()).running).toBe(false);
  });

  it('recusa corpos excessivos antes de alterar arquivos', async () => {
    const { address, token, directory } = await start();
    const response = await fetch(`${address}/api/save`, {
      method: 'POST', headers: { Origin: address, 'X-Customize-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x'.repeat(33 * 1024) })
    });
    expect(response.status).toBe(413);
    await response.arrayBuffer();
    expect(existsSync(path.join(directory, 'extension/branding.js'))).toBe(false);
  });
});

import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG_FILE = 'customization/app.config.json';
export const MAX_ASSET_BYTES = 4 * 1024 * 1024;
const ASSET_FIELDS = ['icon', 'logo', 'extensionIcon'];
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

export function neutralConfiguration() {
  return {
    version: '1.0.0', name: 'Agente Local', shortName: 'Agente Local',
    description: 'Aplicativo local com ferramentas MCP, sessões e permissões explícitas.',
    appId: 'com.exemplo.agentelocal', packageName: 'agente-local', executableName: 'Agente-Local',
    installerPrefix: 'Agente-Local', shortcutName: 'Agente Local', author: 'Equipe do aplicativo',
    extensionName: 'Agente Local', extensionDescription: 'Conecta as conversas do ChatGPT ao aplicativo local.',
    icon: '', logo: '', extensionIcon: '', homepageUrl: '', supportUrl: '', repositoryUrl: '',
    publication: { repository: '' }, theme: { accent: '#2c7be5' }
  };
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function relativeParts(relative) {
  if (typeof relative !== 'string' || !relative || /[\x00-\x1f:]/.test(relative) || path.win32.isAbsolute(relative) || path.posix.isAbsolute(relative)) {
    throw new Error('O caminho deve ser relativo à pasta autorizada.');
  }
  const parts = relative.replaceAll('\\', '/').split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || /[. ]$/.test(part))) {
    throw new Error('O caminho contém um segmento inválido.');
  }
  return parts;
}

export function projectPath(root, relative) {
  const canonicalRoot = realpathSync(root);
  const parts = relativeParts(relative);
  let current = canonicalRoot;
  for (const part of parts) {
    current = path.join(current, part);
    let entry;
    try { entry = lstatSync(current); } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (entry.isSymbolicLink() && !inside(canonicalRoot, realpathSync(current))) {
      throw new Error('O caminho atravessa um link para fora do projeto.');
    }
    if (!inside(canonicalRoot, realpathSync(current))) throw new Error('O caminho sai do projeto.');
  }
  return current;
}

export function resolveCustomAsset(relative, root = PROJECT_ROOT) {
  if (!relative) return null;
  const parts = relativeParts(relative);
  if (!IMAGE_EXTENSIONS.has(path.extname(relative).toLowerCase())) throw new Error('Use uma imagem PNG, JPEG ou WebP.');
  const assetRoot = realpathSync(projectPath(root, 'customization'));
  const asset = projectPath(root, ['customization', ...parts].join('/'));
  if (!inside(assetRoot, realpathSync(asset))) throw new Error('A imagem deve permanecer dentro de customization.');
  const info = statSync(asset);
  if (!info.isFile() || info.size === 0 || info.size > MAX_ASSET_BYTES) throw new Error('A imagem deve ter no máximo 4 MB.');
  return asset;
}

function plainObject(value, name, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name}: objeto inválido.`);
  const unexpected = Object.keys(value).filter((key) => !keys.includes(key));
  if (unexpected.length) throw new Error(`${name}: campo não reconhecido: ${unexpected.join(', ')}.`);
}

function textValue(value, name, max, optional = false) {
  if (typeof value !== 'string' || value.length > max || /[\x00-\x1f\x7f]/.test(value) || value !== value.trim() || (!optional && !value)) {
    throw new Error(`${name}: texto inválido ou maior que ${max} caracteres.`);
  }
}

export function validateConfiguration(input, root = PROJECT_ROOT) {
  plainObject(input, 'Configuração', Object.keys(neutralConfiguration()));
  const config = structuredClone(input);
  for (const key of ['name', 'shortName', 'shortcutName', 'author', 'extensionName']) {
    textValue(config[key], key, key === 'shortName' ? 32 : 75);
    if (/[<>:"/\\|?*]/.test(config[key])) throw new Error(`${key}: remova os caracteres reservados de nomes de arquivo.`);
  }
  textValue(config.description, 'description', 300);
  textValue(config.extensionDescription, 'extensionDescription', 132);
  for (const key of ['appId', 'packageName', 'executableName', 'installerPrefix']) textValue(config[key], key, 120);
  textValue(config.version, 'version', 20);
  if (!/^(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})$/.test(config.version) || config.version.split('.').some((part) => Number(part) > 65535)) {
    throw new Error('version: use o formato 1.0.0, com cada parte entre 0 e 65535.');
  }
  if (!/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){2,}$/.test(config.appId ?? '') || config.appId.length > 120) throw new Error('appId: use um identificador como com.equipe.aplicativo.');
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(config.packageName ?? '')) throw new Error('packageName: use letras minúsculas, números e hífens.');
  for (const key of ['executableName', 'installerPrefix']) {
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{1,79}$/.test(config[key] ?? '')) throw new Error(`${key}: use letras, números e hífens.`);
  }
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(config.executableName)) throw new Error('executableName: este nome é reservado pelo Windows.');
  for (const key of ['homepageUrl', 'supportUrl', 'repositoryUrl']) {
    textValue(config[key], key, 300, true);
    if (config[key]) {
      let url;
      try { url = new URL(config[key]); } catch { throw new Error(`${key}: URL inválida.`); }
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
        throw new Error(`${key}: use HTTPS sem credenciais, parâmetros ou fragmentos.`);
      }
    }
  }
  plainObject(config.publication, 'publication', ['repository']);
  textValue(config.publication.repository, 'publication.repository', 160, true);
  if (config.publication.repository && !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(config.publication.repository)) {
    throw new Error('publication.repository: use proprietário/repositório.');
  }
  plainObject(config.theme, 'theme', ['accent']);
  if (!/^#[0-9a-f]{6}$/i.test(config.theme.accent ?? '')) throw new Error('theme.accent: use uma cor no formato #2c7be5.');
  for (const key of ASSET_FIELDS) {
    textValue(config[key], key, 180, true);
    resolveCustomAsset(config[key], root);
  }
  return config;
}

export function readConfiguration(root = PROJECT_ROOT) {
  const file = projectPath(root, CONFIG_FILE);
  if (statSync(file).size > 32 * 1024) throw new Error('A configuração ultrapassa 32 KB.');
  return validateConfiguration(JSON.parse(readFileSync(file, 'utf8')), root);
}

export function writeProjectFile(relative, content, root = PROJECT_ROOT) {
  const file = projectPath(root, relative);
  if (existsSync(file) && lstatSync(file).isSymbolicLink()) throw new Error('Um arquivo de saída não pode ser um link simbólico.');
  mkdirSync(path.dirname(file), { recursive: true });
  const parent = realpathSync(path.dirname(projectPath(root, relative)));
  const temporary = path.join(parent, `.${path.basename(file)}.${randomBytes(8).toString('hex')}.tmp`);
  let descriptor;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, file);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }

// Só os escalares de identidade mudam; comentários e recursos de cada plataforma continuam no arquivo original.
function updateBuilder(source, replacements) {
  const scopes = [];
  const seen = new Set();
  const result = source.split(/\r?\n/).map((line) => {
    const match = /^( *)([A-Za-z][A-Za-z0-9]*):(.*)$/.exec(line);
    if (!match) return line;
    const indent = match[1].length;
    while (scopes.length && scopes.at(-1).indent >= indent) scopes.pop();
    const key = [...scopes.map((scope) => scope.key), match[2]].join('.');
    if (!match[3].trim()) scopes.push({ key: match[2], indent });
    if (!Object.hasOwn(replacements, key)) return line;
    if (seen.has(key)) throw new Error(`Campo duplicado no empacotamento: ${key}.`);
    seen.add(key);
    return `${match[1]}${match[2]}: ${JSON.stringify(replacements[key])}`;
  }).join('\n');
  for (const key of Object.keys(replacements)) if (!seen.has(key)) throw new Error(`Campo ausente no empacotamento: ${key}.`);
  return result;
}

export function publicBranding(config) {
  return {
    name: config.name, shortName: config.shortName, version: config.version, appId: config.appId,
    packageName: config.packageName, connectorNames: { core: `${config.name} Core`, desktop: `${config.name} Desktop` }
  };
}

export function metadataUpdates(config, root = PROJECT_ROOT) {
  const read = (relative) => readFileSync(projectPath(root, relative), 'utf8');
  const pkg = JSON.parse(read('package.json'));
  Object.assign(pkg, {
    name: config.packageName, productName: config.name, version: config.version, description: config.description,
    author: config.author, desktopName: `${config.appId}.desktop`
  });
  if (config.homepageUrl) pkg.homepage = config.homepageUrl; else delete pkg.homepage;
  if (config.repositoryUrl) pkg.repository = { type: 'git', url: config.repositoryUrl }; else delete pkg.repository;
  const lock = JSON.parse(read('package-lock.json'));
  Object.assign(lock, { name: pkg.name, version: pkg.version });
  Object.assign(lock.packages[''], { name: pkg.name, version: pkg.version });
  const manifest = JSON.parse(read('extension/manifest.json'));
  Object.assign(manifest, { name: config.extensionName, version: config.version, description: config.extensionDescription });
  manifest.action.default_title = config.name;
  for (const script of manifest.content_scripts) script.js = ['branding.js', ...script.js.filter((name) => name !== 'branding.js')];
  const builder = updateBuilder(read('electron-builder.yml'), {
    appId: config.appId, productName: config.name,
    'win.executableName': config.executableName, 'mac.executableName': config.executableName,
    'nsis.shortcutName': config.shortcutName, 'nsis.uninstallDisplayName': config.name,
    'nsis.artifactName': `${config.installerPrefix}-Setup-\${arch}.\${ext}`,
    'mac.artifactName': `${config.installerPrefix}-macOS-\${arch}.\${ext}`,
    'mac.extendInfo.NSScreenCaptureUsageDescription': `${config.name} captura uma tela ou janela somente quando o conector Desktop habilitado solicita observá-la.`,
    'linux.executableName': config.packageName, 'linux.maintainer': config.author,
    'linux.artifactName': `${config.installerPrefix}-Linux-\${env.COS_PACKAGE_ARCH}.\${ext}`
  });
  return new Map([
    ['package.json', json(pkg)], ['package-lock.json', json(lock)], ['extension/manifest.json', json(manifest)],
    ['electron-builder.yml', builder], ['extension/branding.js', `globalThis.LOCAL_APP_BRANDING = Object.freeze(${JSON.stringify(publicBranding(config), null, 2)});\n`]
  ]);
}

export function synchronizeConfiguration(config = readConfiguration(), root = PROJECT_ROOT, saveConfig = false) {
  validateConfiguration(config, root);
  const updates = metadataUpdates(config, root);
  if (saveConfig) updates.set(CONFIG_FILE, json(config));
  const changed = [];
  for (const [relative, content] of updates) {
    const file = projectPath(root, relative);
    const previous = existsSync(file) ? readFileSync(file, 'utf8') : null;
    if (previous !== content) changed.push({ relative, content, previous });
  }
  const written = [];
  try {
    for (const change of changed) {
      writeProjectFile(change.relative, change.content, root);
      written.push(change);
    }
  } catch (error) {
    for (const change of written.reverse()) {
      if (change.previous === null) unlinkSync(projectPath(root, change.relative));
      else writeProjectFile(change.relative, change.previous, root);
    }
    throw error;
  }
  return changed.map((change) => change.relative);
}

export function doctor(root = PROJECT_ROOT) {
  const checks = [];
  let config;
  try {
    config = readConfiguration(root);
    checks.push({ label: 'Configuração válida', ok: true });
    const drift = [...metadataUpdates(config, root)].filter(([relative, content]) => {
      const file = projectPath(root, relative);
      return !existsSync(file) || readFileSync(file, 'utf8') !== content;
    }).map(([relative]) => relative);
    checks.push({ label: drift.length ? `Sincronização pendente: ${drift.join(', ')}` : 'Identidade sincronizada', ok: drift.length === 0 });
  } catch (error) { checks.push({ label: error.message, ok: false }); }
  checks.push({ label: 'Dependências de compilação instaladas', ok: existsSync(projectPath(root, 'node_modules/electron-vite/bin/electron-vite.js')) });
  return { ok: checks.every((check) => check.ok), checks, installer: config ? `${config.installerPrefix}-Setup-x64.exe` : '' };
}

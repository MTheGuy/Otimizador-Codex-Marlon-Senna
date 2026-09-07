import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/main/mcp/call-context.js', () => ({ currentAgent: () => undefined }));

afterEach(() => { vi.resetModules(); });

describe('proteção de credenciais nos diagnósticos', () => {
  it.each([
    ['Authorization: Bearer curto-a1', 'curto-a1'],
    ['Proxy-Authorization: Basic dXNlcjpwdw==', 'dXNlcjpwdw=='],
    ['Cookie: sid=curto-b2; csrf=curto-c3', 'curto-b2'],
    ['Cookie: sid=curto-b2; csrf=curto-c3', 'curto-c3'],
    ['Set-Cookie: sid=curto-d4; HttpOnly; Secure', 'curto-d4'],
    ['{"apiKey":"curto-e5","status":400}', 'curto-e5'],
    ['{"openRouterApiKey":"curto-f6"}', 'curto-f6'],
    ['{"access_token":"curto-g7"}', 'curto-g7'],
    ['{"refreshToken":"curto-h8"}', 'curto-h8'],
    ["password='com espaço'", 'com espaço'],
    ['x-api-key: curto-i9', 'curto-i9'],
    ['https://example.invalid/?token=curto-j0&status=400', 'curto-j0'],
    ['{"Cookie":"sid=curto-k1; outra=curto-l2"}', 'curto-k1'],
    ['{"Cookie":"sid=curto-k1; outra=curto-l2"}', 'curto-l2']
  ])('remove segredo rotulado de %s', async (message, secret) => {
    const { redact } = await import('../src/main/logger.js');
    expect(redact(message)).not.toContain(secret);
  });

  it('preserva diagnósticos comuns e filtros já existentes', async () => {
    const { redact } = await import('../src/main/logger.js');
    const ordinary = 'status=200, tokens=123, tokenCount=50, port=8765, requestId=curto-normal';
    expect(redact(ordinary)).toBe(ordinary);
    expect(redact('chave sk-exemploDeCredencial123')).not.toContain('exemploDeCredencial123');
    expect(redact('valor ' + 'x'.repeat(48))).not.toContain('x'.repeat(48));
  });

  it('higieniza antes de inserir no arquivo, na memória, nos assinantes ou na exportação', async () => {
    const cache = path.join(process.cwd(), 'node_modules', '.cache');
    mkdirSync(cache, { recursive: true });
    const directory = mkdtempSync(path.join(cache, 'logger-redaction-'));
    try {
      const logger = await import('../src/main/logger.js');
      const file = path.join(directory, 'activity.log');
      logger.initLogFile(file);
      const received: string[] = [];
      const unsubscribe = logger.onLog(entry => received.push(entry.message));
      logger.logInfo('token=curto-m3 status=400');
      unsubscribe();
      for (const text of [readFileSync(file, 'utf8'), JSON.stringify(logger.getLog()),
        received.join('\n'), logger.formatLogAsJson(), logger.formatLogForClipboard()]) {
        expect(text).not.toContain('curto-m3');
        expect(text).toContain('status=400');
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('limita a busca por nomes de campos em mensagens opacas extensas', async () => {
    const { redact } = await import('../src/main/logger.js');
    expect(redact('x-'.repeat(30_000) + 'fim')).toBe('***');
  });
});

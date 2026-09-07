import { afterEach, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const html = await readFile(new URL('../extension/popup.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');
let popup: JSDOM | undefined;
afterEach(() => { popup?.window.close(); });

function openPopup(reload: () => void, snapshot?: { status: object; tab: object | null }) {
  popup = new JSDOM(html, { url: 'https://extension-popup.test/', runScripts: 'outside-only' });
  const unavailable = () => new Promise(() => undefined);
  Object.assign(popup.window, {
    chrome: {
      runtime: {
        reload, getManifest: () => ({ name: 'Extensão local de teste' }),
        sendMessage: snapshot ? async (message: { type: string }) => message.type === 'status' ? snapshot.status : snapshot.tab : unavailable
      },
      storage: { local: { get: unavailable } }
    },
    setInterval: () => 0
  });
  popup.window.eval(script);
  return popup.window.document;
}

it('reloads directly once even when the old worker and preference reads never answer', () => {
  const reload = vi.fn();
  const document = openPopup(reload);
  const button = document.getElementById('reloadBtn') as HTMLButtonElement;
  expect(button.closest('details')).toBeNull();
  button.click(); button.click();
  expect(reload).toHaveBeenCalledTimes(1);
  expect(button.disabled).toBe(true);
  expect(document.getElementById('reloadStatus')?.textContent).toContain('Reabra');
});

it('reports a synchronous Chrome reload failure and allows another explicit attempt', () => {
  const reload = vi.fn().mockImplementationOnce(() => { throw new Error('Extension context invalidated'); });
  const document = openPopup(reload);
  const button = document.getElementById('reloadBtn') as HTMLButtonElement;
  button.click();
  expect(button.disabled).toBe(false);
  expect(document.getElementById('reloadStatus')?.textContent).toContain('Extension context invalidated');
  button.click();
  expect(reload).toHaveBeenCalledTimes(2);
});

it('apresenta os controles em português e mantém o nome definido pela extensão', () => {
  const document = openPopup(vi.fn());
  expect(document.documentElement.lang).toBe('pt-BR');
  expect(document.title).toBe('Extensão local de teste');
  expect(document.querySelector('[data-app-name]')?.textContent).toBe('Extensão local de teste');
  expect(document.getElementById('reloadBtn')?.textContent).toBe('Recarregar extensão');
  expect(document.getElementById('copyBtn')?.textContent).toBe('Copiar');
  expect(document.querySelector('label[for="overwriteToggle"] .name')?.textContent).toBe('Substituir visual do ChatGPT');
  expect(document.querySelector('label[for="timeToggle"] .name')?.textContent).toBe('Horários');
});

it('mostra as três etapas confirmadas sem alterar os estados de entrega', async () => {
  const document = openPopup(vi.fn(), {
    status: { connected: true, paired: true, compatible: true, port: 8765 },
    tab: {
      isChat: true, recorder: true, pending: 0, conversationId: 'conversa-teste',
      delivery: { ok: true, total: 2 },
      page: { events: 2, session: 'sessao-teste', trace: [{ read: true, sent: true, app: 'request_id', requestId: 'pedido-teste', tool: 'read_file' }] }
    }
  });
  await vi.waitFor(() => expect(document.getElementById('state')?.textContent).toBe('Conectado · Porta 8765'));
  for (const id of ['s-read', 's-sent', 's-proc']) expect(document.getElementById(id)?.className).toBe('stage done');
  expect(document.getElementById('why')?.textContent).toBe('Todas as chamadas de ferramenta foram vinculadas de ponta a ponta.');
  expect(document.querySelector('.call .tool')?.textContent).toBe('read_file');
  expect(document.querySelector('.call')?.getAttribute('title')).toContain('capturado sim · enviado sim');
});

it('explica em português uma desconexão explícita e conserva o botão de reconectar', async () => {
  const document = openPopup(vi.fn(), {
    status: { connected: false, paired: false, disconnected: true },
    tab: { isChat: true, recorder: true, pending: 2, page: { events: 2 } }
  });
  await vi.waitFor(() => expect(document.getElementById('state')?.textContent).toBe('Desconectado'));
  expect(document.getElementById('retryBtn')?.textContent).toBe('Conectar');
  expect((document.getElementById('retryBtn') as HTMLButtonElement).hidden).toBe(false);
  expect(document.getElementById('s-sent')?.className).toBe('stage failed');
  expect(document.getElementById('n-sent')?.textContent).toBe('2 retidos');
  expect(document.getElementById('why')?.textContent).toBe('O aplicativo está inacessível. Nenhum dado está saindo deste navegador.');
  expect((document.getElementById('stream') as HTMLDetailsElement).open).toBe(true);
});

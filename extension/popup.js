/**
 * Status UI, and the one place that answers "where did the stream stop?".
 *
 * Everything this browser observes has to survive three hand-offs before the desktop app
 * has it: this extension reads it off the page, the service worker delivers it, and the
 * app records it into a session for this chat. All three used to fail the same way from
 * here — nothing happens — so "Reaching the app" opens onto those three stages stated
 * separately, and names the one that did not complete.
 *
 * It opens itself when something is wrong and stays shut when nothing is, because a panel
 * that is always expanded is a panel nobody reads.
 */

const $ = (id) => document.getElementById(id);
const extensionName = chrome.runtime.getManifest().name;
document.title = extensionName;
document.querySelector('[data-app-name]').textContent = extensionName;
// This explicit action runs in the freshly opened popup, never through the worker
// it is meant to replace. It therefore remains usable when that worker is stale
// or its status/connection requests never return.
$('reloadBtn').addEventListener('click', () => {
  const button = $('reloadBtn');
  if (button.disabled) return;
  button.disabled = true;
  $('reloadStatus').textContent = 'Recarga solicitada. Reabra este painel para verificar a conexão.';
  try {
    chrome.runtime.reload();
  } catch (error) {
    button.disabled = false;
    $('reloadStatus').textContent = `Falha ao recarregar: ${error instanceof Error ? error.message : String(error)}`;
  }
});
const RENDER_STREAM_KEY = 'renderStreamEnabled';
const SHOW_TIMES_KEY = 'showStreamTimes';
const POLL_MS = 1500;

let overwriteEnabled = true;
let showTimes = false;
let latest = { status: null, tab: null };
let openedOnFailure = false;

// ------------------------------------------------------------------ formatting

/** Ids are long and only their ends identify them, so keep both ends rather than one. */
function shorten(value, keep = 6) {
  const text = String(value || '');
  if (text.length <= keep + 5) return text;
  return `${text.slice(0, keep)}…${text.slice(-4)}`;
}

function ago(at) {
  if (!at) return '';
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

/** One capture row: ok, no, wait or off, plus whatever it wants to say on the right. */
function row(name, state, meta) {
  $(`r-${name}`).className = `row ${state}`;
  const value = $(`d-${name}`);
  value.textContent = meta === null || meta === undefined ? '' : meta;
}

function idRow(name, state, meta, full) {
  row(name, state, meta);
  const value = $(`d-${name}`);
  value.title = full || '';
  value.disabled = !full;
}

function stage(name, state, meta) {
  $(`s-${name}`).className = `stage ${state}`;
  $(`n-${name}`).textContent = meta || '';
}

// -------------------------------------------------------------------- pipeline

/** How the app describes what it placed a call on, in its own words. */
const ATTRIBUTION = {
  request_id: 'ID exato da solicitação',
  unattributed: 'ID da solicitação não identificado',
  agent: 'chave do agente',
  turn: 'bloco de ferramenta na página',
  generation: 'única conversa gerando resposta',
  inferred: 'sem vínculo com uma conversa'
};

/**
 * The three stages, from evidence each layer produced independently.
 *
 * Deliberately not one flag set by whoever ran last: "picked up" is the page's own count,
 * "sent to app" is the service worker's delivery log, and "app processed" is the app
 * naming a session for this chat on the feed the page polls. A stage is only green when
 * the layer that owns it said so.
 */
function pipeline(info, ready) {
  const page = info && info.page;
  const sent = info && info.delivery;
  const pending = info ? info.pending : 0;
  const read = page ? page.events : 0;

  if (!info || !info.isChat) return { read: ['off'], sent: ['off'], proc: ['off'], why: ['', ''] };
  if (!info.recorder) {
    return { read: ['failed'], sent: ['off'], proc: ['off'], why: ['bad', 'O registro não está ativo nesta aba. Recarregue a página.'] };
  }
  if (read === 0) {
    return { read: ['running'], sent: ['off'], proc: ['off'], why: ['', 'Aguardando a primeira mensagem.'] };
  }

  const readStage = ['done', String(read)];
  if (!ready) {
    return {
      read: readStage,
      sent: ['failed', pending ? `${pending} retidos` : ''],
      proc: ['off'],
      why: ['bad', 'O aplicativo está inacessível. Nenhum dado está saindo deste navegador.']
    };
  }
  if (sent && sent.ok === false) {
    return {
      read: readStage,
      sent: ['failed', String(sent.error || 'falha')],
      proc: ['off'],
      why: ['bad', `O aplicativo recusou o último envio (${sent.error || 'falha'}).`]
    };
  }
  // Refused by the extension itself, before anything could be queued for the app. `pending`
  // counts only what the service worker already owns, so a document it is rejecting outright
  // reported nothing pending and this drawer went on to say "Delivered" — which is what it
  // said all through the 2026-08-21 blackout while the tab was reading ChatGPT perfectly and
  // sending none of it. The page is the only layer that knows, so it is the layer that says so.
  if (page.blocked) {
    return {
      read: readStage,
      sent: ['failed', page.queued ? `${page.queued} retidos na página` : String(page.blocked)],
      proc: ['off'],
      why: [
        'bad',
        'A extensão não está aceitando os registros desta aba (' +
          String(page.blocked) +
          '). Recarregue a aba do ChatGPT.'
      ]
    };
  }
  if (pending > 0) {
    return {
      read: readStage,
      sent: ['running', `${pending} na fila`],
      proc: ['off'],
      why: ['', 'Na fila local. Tentando enviar novamente ao aplicativo.']
    };
  }

  const sentStage = ['done', sent && sent.total ? String(sent.total) : ''];
  if (!page.session) {
    return {
      read: readStage,
      sent: sentStage,
      proc: ['running'],
      why: ['', 'Enviado. O aplicativo ainda não abriu uma sessão para esta conversa.']
    };
  }

  const calls = Array.isArray(page.trace) ? page.trace : [];
  const placed = calls.filter((call) => call.app === 'request_id').length;
  const missed = calls.filter((call) => call.app && call.app !== 'request_id');
  if (missed.length > 0) {
    return {
      read: readStage,
      sent: sentStage,
      proc: ['failed', `${placed}/${calls.length}`],
      why: [
        'bad',
        `O aplicativo não conseguiu vincular ${missed.length === 1 ? 'uma chamada' : `${missed.length} chamadas`} pelo ID da solicitação — utilizou ${ATTRIBUTION[missed[0].app] || missed[0].app}.`
      ]
    };
  }
  return {
    read: readStage,
    sent: sentStage,
    proc: ['done', calls.length ? `${placed}/${calls.length}` : ''],
    why: ['', calls.length ? 'Todas as chamadas de ferramenta foram vinculadas de ponta a ponta.' : 'Registrando no aplicativo.']
  };
}

/** One row per request id: three dots, the tool, the id. Newest first. */
function paintCalls(page) {
  const box = $('calls');
  box.textContent = '';
  const rows = page && Array.isArray(page.trace) ? page.trace.slice(0, 5) : [];
  for (const entry of rows) {
    const line = document.createElement('div');
    line.className = 'call';
    const pips = document.createElement('span');
    pips.className = 'pips';
    for (const state of [
      entry.read ? 'on' : '',
      entry.sent ? 'on' : '',
      entry.app ? (entry.app === 'request_id' ? 'on' : 'bad') : ''
    ]) {
      const pip = document.createElement('span');
      pip.className = `pip ${state}`;
      pips.append(pip);
    }
    const tool = document.createElement('span');
    tool.className = 'tool';
    tool.textContent = entry.tool || 'chamada de ferramenta';
    const id = document.createElement('span');
    id.className = 'id';
    id.textContent = shorten(entry.requestId, 5);
    line.title = `${entry.requestId} — capturado ${entry.read ? 'sim' : 'não'} · enviado ${entry.sent ? 'sim' : 'não'} · aplicativo ${ATTRIBUTION[entry.app] || 'sem registro'}`;
    line.append(pips, tool, id);
    box.append(line);
  }
}

// ------------------------------------------------------------------- rendering

function paintHeader(status) {
  const connected = status && status.connected === true;
  const paired = status && status.paired === true;
  const incompatible = connected && status.compatible === false;
  // Disconnected on purpose. This has to say so plainly rather than describing it as a
  // connection that has not finished yet, which is what it looked like back when the next
  // poll would silently undo it.
  const off = status && status.disconnected === true && !paired;
  const ready = connected && paired && !incompatible;

  $('pill').className = `pill ${ready ? '' : incompatible ? 'bad' : 'off'}`;
  $('state').textContent = incompatible
    ? 'Versões incompatíveis'
    : off
      ? 'Desconectado'
      : !connected
        ? 'Aplicativo fechado'
        : ready
          ? `Conectado · Porta ${status.port}`
          : `Porta ${status.port} · conectando`;

  $('retryBtn').hidden = ready || incompatible;
  $('retryBtn').textContent = off ? 'Conectar' : 'Tentar novamente';
  $('unpairBtn').hidden = !paired || incompatible;
  return ready;
}

function paintAlert(status, info) {
  const page = info && info.page;
  const incompatible = status && status.connected === true && status.compatible === false;
  const pairError = status && status.pairError;
  const error = page && page.lastError;
  const text = incompatible
    ? 'O aplicativo e esta extensão usam protocolos de conexão incompatíveis.'
    : pairError && pairError.message
      ? pairError.message
      : pairError && pairError.error === 'secure_storage_unavailable'
        ? 'O armazenamento seguro de credenciais está indisponível. Abra o aplicativo para conferir a configuração.'
    : error && Date.now() - error.at < 10 * 60 * 1000
      ? error.text
      : '';
  $('alert').textContent = text;
  $('alert').hidden = !text;
}

function detail(list, term, value, bad) {
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
  if (bad) dd.className = 'bad';
  dd.title = dd.textContent;
  list.append(dt, dd);
}

/**
 * Only what changes the reading of the three stages.
 *
 * An earlier draft of this drawer listed twenty-eight fields, which is a different thing
 * from being informative: nothing in it told you which layer had stopped.
 */
function paintDetails(status, info) {
  if (!$('more').open) return;
  const grid = $('grid');
  grid.textContent = '';
  const page = info && info.page;
  const sent = info && info.delivery;

  detail(grid, 'aplicativo', status ? `v${status.appVersion || '?'} · porta ${status.port || '—'}` : null);
  detail(
    grid,
    'extensão',
    status ? `v${status.extensionVersion} · protocolo ${status.extensionProtocol}` : null,
    status && status.compatible === false
  );
  detail(grid, 'ID da conversa', (info && info.conversationId) || null);
  detail(grid, 'sessão no aplicativo', (page && page.session) || null, Boolean(page && !page.session));
  detail(grid, 'aba', info ? `${info.tab} · geração ${info.epoch ?? '—'}` : null);
  detail(
    grid,
    'vínculo',
    info ? (info.terminal ? 'encerrado' : info.bound ? 'vinculado' : 'sem vínculo') : null,
    Boolean(info && info.terminal)
  );
  detail(grid, 'registro', page ? `fiber v${page.recorderVersion} · execução ${page.runId}` : 'não conectado', !page);
  detail(grid, 'turno', page ? (page.generating ? `${shorten(page.turnId, 8)} · ativo` : 'em espera') : null);
  detail(grid, 'observado', page ? `${page.events} eventos · ${page.calls} chamadas` : null);
  detail(
    grid,
    'neste navegador',
    info ? `${info.pending} retidos · ${info.pendingAll} no total` : null,
    Boolean(info && info.pendingAll)
  );
  detail(
    grid,
    'último envio',
    sent && sent.at ? `${sent.ok ? 'ok' : sent.error || 'falha'} · ${sent.events} · há ${ago(sent.at)}` : null,
    Boolean(sent && sent.ok === false)
  );
  detail(grid, 'enviado', sent ? sent.total : null);
  detail(grid, 'envios da página', page ? `${page.sends} · ${page.failures} com falha` : null, Boolean(page && page.failures));
}

async function refresh() {
  const [status, info] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'status' }),
    chrome.runtime.sendMessage({ type: 'tabStatus' }).catch(() => null)
  ]);
  latest = { status, tab: info };

  const ready = paintHeader(status);
  const isChat = Boolean(info && info.isChat);
  const page = info && info.page;

  row('tab', isChat ? 'ok' : 'off', isChat ? '' : 'nenhuma aberta');
  row('rec', !isChat ? 'off' : info.recorder ? 'ok' : 'no', !isChat ? '' : info.recorder ? (page.generating ? 'respondendo' : '') : 'recarregue');

  const chatId = info && info.conversationId;
  idRow('chat', !isChat ? 'off' : chatId ? 'ok' : 'wait', !isChat ? '' : chatId ? shorten(chatId, 8) : 'nova conversa', chatId);

  const requestId = page && page.requestId;
  idRow('req', !isChat ? 'off' : requestId ? 'ok' : 'wait', !isChat ? '' : requestId ? shorten(requestId, 9) : 'nenhuma ainda', requestId);

  const state = pipeline(info, ready);
  stage('read', ...state.read);
  stage('sent', ...state.sent);
  stage('proc', ...state.proc);
  $('why').textContent = state.why[1];
  $('why').className = `why ${state.why[0]}`;
  paintCalls(page);

  const broken = state.why[0] === 'bad';
  const flowing = state.proc[0] === 'done';
  row(
    'app',
    !isChat ? 'off' : broken ? 'no' : flowing ? 'ok' : 'wait',
    !isChat ? '' : broken ? 'bloqueado' : flowing ? ago(info.delivery && info.delivery.at) || 'ativo' : 'aguardando'
  );
  // Opens itself the first time something is actually wrong, so the panel that explains
  // the failure is already open when the popup is opened to look at one.
  if (broken && !openedOnFailure) {
    openedOnFailure = true;
    $('stream').open = true;
  }

  paintAlert(status, info);
  paintDetails(status, info);
}

// -------------------------------------------------------------------- controls

function syncOverwrite() {
  $('overwriteToggle').checked = overwriteEnabled;
}

async function loadPreferences() {
  const stored = await chrome.storage.local.get([RENDER_STREAM_KEY, SHOW_TIMES_KEY]);
  overwriteEnabled = stored[RENDER_STREAM_KEY] !== false;
  showTimes = stored[SHOW_TIMES_KEY] === true;
  syncOverwrite();
  $('timeToggle').checked = showTimes;
}

/** Puts one value on the clipboard and says so in place, without moving anything. */
async function copyInto(button, text) {
  if (!text) return;
  const was = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'copiado';
  } catch {
    button.textContent = 'falha ao copiar';
  }
  setTimeout(() => {
    if (button.textContent === 'copiado' || button.textContent === 'falha ao copiar') button.textContent = was;
  }, 900);
}

for (const id of ['d-chat', 'd-req']) {
  $(id).addEventListener('click', (event) => {
    event.preventDefault();
    void copyInto(event.currentTarget, event.currentTarget.title);
  });
}

$('copyBtn').addEventListener('click', (event) => {
  const cells = [...$('grid').children].map((node) => node.textContent);
  const lines = [$('why').textContent];
  for (let index = 0; index < cells.length; index += 2) lines.push(`${cells[index]}: ${cells[index + 1]}`);
  void copyInto(event.currentTarget, lines.join('\n'));
});

$('more').addEventListener('toggle', () => paintDetails(latest.status, latest.tab));

$('retryBtn').addEventListener('click', async () => {
  $('retryBtn').disabled = true;
  await chrome.runtime.sendMessage({ type: 'pair' });
  $('retryBtn').disabled = false;
  await refresh();
});

$('unpairBtn').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'unpair' });
  await refresh();
});

$('overwriteToggle').addEventListener('change', async () => {
  const previous = overwriteEnabled;
  overwriteEnabled = $('overwriteToggle').checked === true;
  syncOverwrite();
  try {
    await chrome.storage.local.set({ [RENDER_STREAM_KEY]: overwriteEnabled });
    // The toggle is the action. Enabling it immediately pulls the latest app timeline into
    // every known ChatGPT tab; there is deliberately no second "Overwrite now" button.
    if (overwriteEnabled) await chrome.runtime.sendMessage({ type: 'overwriteNow' });
  } catch {
    overwriteEnabled = previous;
    syncOverwrite();
  }
});

$('timeToggle').addEventListener('change', async () => {
  showTimes = $('timeToggle').checked === true;
  await chrome.storage.local.set({ [SHOW_TIMES_KEY]: showTimes });
});

// A popup is open for seconds at a time and the three stages move within those seconds.
void loadPreferences().catch(() => undefined);
void refresh().catch(() => undefined);
setInterval(() => void refresh().catch(() => undefined), POLL_MS);

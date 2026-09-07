import { $, el, run } from './dom.js';
import { DEFAULT_USAGE_FORMULA, usageEstimate, type UsageFormula, type UsageOverview } from '../shared/usage.js';
let snapshot: UsageOverview | null = null;
let loadGeneration = 0;
const FORMULA_KEY = 'usage-formula-v1';
let formula: UsageFormula = { ...DEFAULT_USAGE_FORMULA, rates: { ...DEFAULT_USAGE_FORMULA.rates } };
function saveFormula(): void {
  try { localStorage.setItem(FORMULA_KEY, JSON.stringify(formula)); } catch { /* Read-only storage still permits an in-memory comparison. */ }
}

const count = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const featureLabels: Record<string, string> = { deep_research: 'Pesquisa aprofundada', file_upload: 'Envio de arquivos', paste_text_to_file: 'Arquivos de texto colados', image_gen: 'Geração de imagens' };
const metricLabels: Record<string, string> = {
  'Processed tokens · est.': 'Tokens processados · est.', 'Peak daily tokens': 'Maior uso diário de tokens',
  Conversations: 'Conversas', 'Active days': 'Dias ativos'
};
const effortLabels: Record<string, string> = { none: 'Instantâneo', minimal: 'Mínimo', low: 'Baixo', medium: 'Médio', high: 'Alto', xhigh: 'Extra alto', max: 'Máximo', ultra: 'Ultra', pro: 'Pro' };
function usageHint(node: HTMLElement, text: string): void {
  node.dataset.usageHint = text;
  node.setAttribute('tabindex', '0');
  const hide = () => document.getElementById('usageTooltip')?.remove();
  const show = () => {
    hide();
    const tip = el('div', 'session-tooltip', node.dataset.usageHint ?? ''); tip.id = 'usageTooltip'; tip.setAttribute('role', 'tooltip');
    const bounds = node.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(bounds.left, window.innerWidth - 290))}px`;
    tip.style.top = `${Math.max(8, bounds.top - 64)}px`;
    document.body.append(tip);
  };
  node.addEventListener('pointerenter', show); node.addEventListener('pointerleave', hide);
  node.addEventListener('focus', show); node.addEventListener('blur', hide);
  node.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
}
function dateKey(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
export async function refreshUsage(): Promise<void> {
  document.getElementById('usageTooltip')?.remove();
  const generation = ++loadGeneration;
  $('refreshUsage').setAttribute('disabled', '');
  const status = $('usageStatus');
  status.textContent = snapshot ? 'Atualizando…' : 'Calculando o uso registrado das ferramentas…';
  status.setAttribute('role', 'status');
  try {
    const [value, catalog] = await Promise.all([run(window.api.getUsage()), run(window.api.getChatModels())]);
    if (generation !== loadGeneration) return;
    if (!value) { status.textContent = 'Não foi possível carregar o uso. Tente atualizar.'; return; }
    snapshot = value;
    const summary = $('usageSummary'); summary.replaceChildren();
    for (const [label, number] of [['Processed tokens · est.', value.tokens], ['Peak daily tokens', Math.max(0, ...value.days.map((day) => day.tokens))], ['Conversations', value.sessions], ['Active days', value.days.filter((day) => day.tokens > 0).length]] as const) {
      const item = el('div'); item.dataset.usageMetric = label; usageHint(item, `${Math.round(number).toLocaleString()} ${metricLabels[label]!.toLowerCase()}`); item.append(el('strong', '', count.format(number)), el('span', '', metricLabels[label]!)); summary.append(item);
    }
    const limits = $('modelUsage'); limits.replaceChildren();
    const modelRows = value.limits.filter((row) => row.scope === 'model');
    const knownModels = catalog?.models ?? [];
    for (const model of knownModels.filter((item) => !modelRows.some((row) => row.model === item.id))) {
      const row = el('div', 'usage-limit'); row.append(el('strong', '', model.label), el('span', 'muted', 'Não informado pelo ChatGPT')); limits.append(row);
    }
    for (const entry of [...modelRows, ...value.limits.filter((row) => row.scope !== 'model')]) {
      const stale = Date.now() - entry.observedAt > 10 * 60000 || (entry.resetAt !== null && entry.resetAt <= Date.now());
      const row = el('div', 'usage-limit');
      const displayName = entry.scope === 'feature' ? featureLabels[entry.model] ?? entry.model : entry.model;
      const name = el('div'); name.append(el('strong', '', displayName));
      if (entry.scope !== 'model') name.append(el('small', 'muted', entry.scope === 'shared' ? 'Limite de uso compartilhado' : 'Cota do recurso'));
      const detail = el('div');
      detail.append(el('b', '', stale ? 'Atualização necessária' : entry.remaining !== null ? `${entry.remaining.toLocaleString()} restantes` : entry.remainingPercent !== null ? `${Math.round(entry.remainingPercent)}% restantes` : 'Não informado'));
      const window = entry.windowSeconds === 604800 ? 'Semanal · ' : entry.windowSeconds ? `${Math.round(entry.windowSeconds / 3600)}h de período · ` : '';
      detail.append(el('small', 'muted', window + (entry.resetAt ? `Renova em ${new Date(entry.resetAt).toLocaleString()}` : 'Renovação não informada')));
      if (entry.remainingPercent !== null && !stale) { const progress = document.createElement('progress'); progress.max = 100; progress.value = entry.remainingPercent; progress.setAttribute('aria-label', `${displayName}: ${entry.remainingPercent}% restantes`); detail.append(progress); }
      row.append(name, detail); limits.append(row);
    }
    if (!modelRows.length) limits.append(el('p', 'muted', 'O ChatGPT não informou o saldo de mensagens por modelo. Limites compartilhados e cotas de recursos não indicam o saldo de um modelo específico.'));
    const totalCost = el('div'); totalCost.append(el('strong', '', '—'), el('span', '', 'Equivalente estimado · USD')); totalCost.id = 'usageTotalCost'; usageHint(totalCost, ''); summary.prepend(totalCost);
    paintRates();
    paintCost();
    status.textContent = 'Estimativa baseada nos modelos registrados; sem histórico, considera GPT-5.6 com esforço alto. Registros sem alterações reutilizam os totais salvos.';
  } finally { if (generation === loadGeneration) $('refreshUsage').removeAttribute('disabled'); }
}
function paintRates(): void {
  if (!snapshot) return;
  const host = $('usageRates'); host.replaceChildren();
  for (const model of [...new Set(snapshot.models.map(row => row.model))].sort()) {
    const label = el('label', 'setting'); const text = el('span', 'setting-text');
    text.append(el('b', '', model), el('em', '', Object.hasOwn(DEFAULT_USAGE_FORMULA.rates, model) ? 'USD / 1 milhão de tokens de entrada em cache · referência oficial editável, verificada em 5 de setembro de 2026' : 'USD / 1 milhão de tokens de entrada em cache · informe uma tarifa de comparação verificada'));
    const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.step = '0.01'; input.placeholder = 'Tarifa desconhecida'; input.value = formula.rates[model]?.toString() ?? '';
    input.setAttribute('aria-label', `${model} — USD por milhão de tokens de entrada em cache`);
    input.addEventListener('input', () => {
      if (input.value === '') formula.rates[model] = null;
      else if (input.validity.valid && Number.isFinite(input.valueAsNumber)) formula.rates[model] = input.valueAsNumber;
      else return;
      saveFormula(); paintCost();
    });
    label.append(text, input); host.append(label);
  }
}
function paintCost(): void {
  if (!snapshot) return;
  const total = usageEstimate(snapshot.models, formula);
  const costText = (estimate: ReturnType<typeof usageEstimate>) => estimate.unpricedTokens > 0 ? `${money.format(estimate.cost)} + sem tarifa` : money.format(estimate.cost);
  const costSummary = document.getElementById('usageTotalCost');
  if (costSummary) {
    costSummary.querySelector('strong')!.textContent = costText(total);
    costSummary.dataset.usageHint = `${Math.round(total.tokens).toLocaleString()} tokens estimados; ${Math.round(total.unpricedTokens).toLocaleString()} não têm tarifa de comparação. Equivalente de entrada em cache, não uma cobrança.`;
  }
  const daily = snapshot.days.map(day => ({ ...day, ...usageEstimate(day.models, formula) }));
  for (const [label, number] of [['Processed tokens · est.', total.tokens], ['Peak daily tokens', Math.max(0, ...daily.map(day => day.tokens))]] as const) {
    const item = [...$('usageSummary').children].find(node => (node as HTMLElement).dataset.usageMetric === label) as HTMLElement | undefined;
    if (item) { item.querySelector('strong')!.textContent = count.format(number); item.dataset.usageHint = `${Math.round(number).toLocaleString()} ${metricLabels[label]!.toLowerCase()}`; }
  }
  const heat = $('usageHeatmap'); heat.replaceChildren();
  const byDay = new Map(daily.map(day => [day.date, day.tokens])); const peak = Math.max(1, ...daily.map(day => day.tokens));
  for (let ago = 363; ago >= 0; ago--) {
    const date = new Date(); date.setDate(date.getDate() - ago); const key = dateKey(date), tokens = byDay.get(key) ?? 0;
    const cell = el('span', 'heat-cell'); cell.dataset.level = String(tokens ? Math.max(1, Math.ceil(tokens / peak * 4)) : 0); const hint = `${key}: ${Math.round(tokens).toLocaleString()} tokens estimados`; usageHint(cell, hint); cell.setAttribute('aria-label', hint); heat.append(cell);
  }
  $('usageFormula').textContent = `Contexto final da interface × chamadas únicas de ferramenta ÷ ${formula.divisor} × tarifa de entrada em cache de cada modelo ÷ 1 milhão × ${formula.multiplier}.`;
  $('usageCost').textContent = `${costText(total)} de equivalente estimado. ${total.unpricedTokens ? `${Math.round(total.unpricedTokens).toLocaleString()} tokens não têm tarifa. ` : ''}Esta é uma comparação, não uma cobrança.`;
  const modelTable = el('table', 'usage-table'); const modelHead = el('tr');
  for (const title of ['Modelo / esforço registrado', 'Tokens estimados', 'Equivalente estimado']) modelHead.append(el('th', '', title));
  modelTable.append(modelHead);
  for (const entry of snapshot.models) {
    const estimate = usageEstimate([entry], formula); const row = el('tr');
    row.append(el('td', '', `${entry.model} · ${effortLabels[entry.reasoningEffort ?? ''] ?? entry.reasoningEffort ?? 'esforço desconhecido'}${entry.assumed ? ' (estimado)' : ''}`), el('td', '', Math.round(estimate.tokens).toLocaleString()), el('td', '', estimate.unpricedTokens ? 'Tarifa desconhecida' : money.format(estimate.cost))); modelTable.append(row);
  }
  const table = el('table', 'usage-table'); const head = el('tr');
  head.append(el('th', '', 'Dia'), el('th', '', 'Tokens estimados'), el('th', '', `Cache × ${formula.multiplier}`)); table.append(head);
  for (const day of [...daily].reverse()) { const row = el('tr'); row.append(el('td', '', day.date), el('td', '', Math.round(day.tokens).toLocaleString()), el('td', '', costText(day))); table.append(row); }
  if (!snapshot.days.length) { const row = el('tr'); const cell = el('td', 'muted', 'Nenhuma chamada de ferramenta registrada ainda.'); cell.setAttribute('colspan', '3'); row.append(cell); table.append(row); }
  $('usageDays').replaceChildren(modelTable, table);
}
export function initUsage(): void {
  try {
    const saved = JSON.parse(localStorage.getItem(FORMULA_KEY) ?? 'null');
    if (saved && Number.isFinite(saved.divisor) && saved.divisor > 0 && Number.isFinite(saved.multiplier) && saved.multiplier >= 0 && saved.rates && typeof saved.rates === 'object' && !Array.isArray(saved.rates)) {
      formula = { divisor: saved.divisor, multiplier: saved.multiplier, rates: { ...DEFAULT_USAGE_FORMULA.rates, ...Object.fromEntries(Object.entries(saved.rates).filter(([key, value]) => key.length <= 100 && (value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0))) } as UsageFormula['rates'] };
    }
  } catch { /* Invalid display preferences use the documented default. */ }
  for (const [key, id] of [['divisor', 'usageDivisor'], ['multiplier', 'usageMultiplier']] as const) {
    const input = $<HTMLInputElement>(id); input.value = String(formula[key]);
    input.addEventListener('input', () => { if (input.value !== '' && input.validity.valid && Number.isFinite(input.valueAsNumber)) { formula[key] = input.valueAsNumber; saveFormula(); paintCost(); } });
  }
  $('refreshUsage').addEventListener('click', () => void refreshUsage());
}

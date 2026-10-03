#!/usr/bin/env node
// Разбор экспортов n8n для шага 1 (разведка) скилла ai-documentation.
// Запуск: node scan-n8n.js <корень проекта> [--code] [--no-sticky]
//   --code       полный код нод Code (по умолчанию — первые строки)
//   --no-sticky  без текста sticky-заметок
// Печатает по каждому workflow: настройки, граф нод, ветвления,
// промпты и параметры моделей, credentials, sticky-заметки.
// Только читает файлы. Значения секретов маскируются.

const fs = require('fs');
const path = require('path');
const { SECRET_FIELD, mask, maskValue } = require('./lib/secrets');
const { walk } = require('./lib/project-files');

const args = process.argv.slice(2);
const withCode = args.includes('--code');
const withSticky = !args.includes('--no-sticky');
const root = path.resolve(args.find((a) => !a.startsWith('--')) || '.');

const CODE_PREVIEW_LINES = 5;
const TEXT_LIMIT = 300;

const rel = (p) => path.relative(root, p).split(path.sep).join('/');
const short = (t) => t.replace('n8n-nodes-base.', '').replace('@n8n/n8n-nodes-langchain.', 'lc.');
const clip = (s, n = TEXT_LIMIT) => { const t = mask(String(s)).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
const full = (s) => mask(String(s));
const indent = (s, pad) => s.split('\n').map((l) => pad + l).join('\n');

function loadWorkflows() {
  const list = [];
  for (const f of walk(root).filter((p) => p.toLowerCase().endsWith('.json'))) {
    let w;
    try { w = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { continue; }
    for (const item of Array.isArray(w) ? w : [w]) {
      if (item && Array.isArray(item.nodes) && item.connections && typeof item.connections === 'object') {
        list.push({ file: f, w: maskValue(item) });
      }
    }
  }
  return list;
}

// Значение параметра resource locator ({__rl, value, cachedResultName}) или обычное.
const rl = (v) => (v && typeof v === 'object' && '__rl' in v ? (v.cachedResultName || v.value) : v);

function conditionsText(conds) {
  const list = (conds && (conds.conditions || conds)) || [];
  if (!Array.isArray(list)) return '';
  const combinator = conds && conds.combinator;
  const separator = combinator === 'or' ? ' ИЛИ ' : combinator === 'and' || !combinator ? ' И ' : ` [неизвестный оператор ${clip(combinator)}] `;
  return list.map((c) => `${clip(c.leftValue, 120)} ${c.operator ? c.operator.operation : ''} ${c.rightValue !== undefined ? clip(c.rightValue, 80) : ''}`.trim()).join(separator);
}

function outputLabels(node) {
  const t = node.type;
  if (/\.if$/.test(t)) return ['true', 'false'];
  if (/\.switch$/.test(t)) {
    const rules = (node.parameters.rules && node.parameters.rules.values) || [];
    const labels = rules.map((r, i) => r.outputKey || `правило ${i}`);
    const fb = node.parameters.options && node.parameters.options.fallbackOutput;
    if (fb === 'extra') labels.push('иначе');
    return labels;
  }
  return [];
}

function details(node, idToName) {
  const p = node.parameters || {};
  const t = node.type;
  const d = [];
  if (node.credentials) d.push('credentials: ' + Object.entries(node.credentials).map(([k, v]) => `${v.name} (${k})`).join(', '));
  if (node.disabled) d.push('ОТКЛЮЧЕНА');
  if (node.onError) d.push(`onError: ${node.onError}`);
  if (node.retryOnFail) d.push(`retry: ${node.maxTries || 'да'}`);
  if (node.alwaysOutputData) d.push('alwaysOutputData');
  if (node.notes) d.push('заметка: ' + clip(node.notes));

  if (/executeWorkflow$/.test(t)) {
    const target = rl(p.workflowId);
    d.push(`вызывает: ${idToName[target] || target}`);
    const inputs = p.workflowInputs && p.workflowInputs.value;
    if (inputs && Object.keys(inputs).length) d.push('входы: ' + Object.entries(inputs).map(([k, v]) => `${k}=${clip(v, 80)}`).join('; '));
  } else if (/\.if$/.test(t)) {
    d.push('условие: ' + conditionsText(p.conditions));
  } else if (/\.switch$/.test(t)) {
    const rules = (p.rules && p.rules.values) || [];
    rules.forEach((r, i) => d.push(`правило ${i} «${r.outputKey || ''}»: ${conditionsText(r.conditions)}`));
  } else if (/dataTable$/.test(t)) {
    d.push(`операция: ${p.operation || 'по умолчанию'}; таблица: ${rl(p.dataTableId)}`);
    if (p.filters) d.push('фильтр: ' + clip(JSON.stringify(p.filters), 200));
  } else if (/scheduleTrigger$/.test(t)) {
    d.push('расписание: ' + JSON.stringify(p.rule));
  } else if (/httpRequest$/.test(t)) {
    d.push(`${p.method || 'GET'} ${clip(p.url, 200)}`);
    if (p.authentication) d.push(`auth: ${p.authentication}${p.nodeCredentialType ? ' / ' + p.nodeCredentialType : ''}`);
    const hdrs = (p.headerParameters && p.headerParameters.parameters) || [];
    if (hdrs.length) d.push('заголовки: ' + hdrs.map((h) => `${h.name}=${SECRET_FIELD.test(h.name) ? '<секрет скрыт>' : clip(h.value, 80)}`).join('; '));
    const body = (p.bodyParameters && p.bodyParameters.parameters) || [];
    if (body.length) d.push('тело: ' + body.map((b) => `${b.name}=${SECRET_FIELD.test(b.name) ? '<секрет скрыт>' : clip(b.value !== undefined ? b.value : `<${b.parameterType || 'поле'}>`, 80)}`).join('; '));
    if (p.jsonBody) d.push('JSON-тело: ' + clip(p.jsonBody, 200));
  } else if (/code$/.test(t)) {
    const code = p.jsCode || p.pythonCode || '';
    const lines = code.split('\n');
    d.push(`код: ${p.language || 'javaScript'}, ${lines.length} строк`);
    d.push('\n' + indent(full(withCode ? code : lines.slice(0, CODE_PREVIEW_LINES).join('\n') + (lines.length > CODE_PREVIEW_LINES ? '\n…' : '')), '      | '));
  } else if (/\.set$/.test(t)) {
    const as = (p.assignments && p.assignments.assignments) || [];
    if (as.length) d.push('поля: ' + as.map((a) => `${a.name}=${SECRET_FIELD.test(a.name) ? '<секрет скрыт>' : clip(a.value, 100)}`).join('; '));
  } else if (/telegram$/.test(t)) {
    d.push(`${p.resource || 'message'}/${p.operation || 'sendMessage'}`);
    if (p.chatId) d.push(`chatId: ${clip(p.chatId, 100)}`);
    if (p.text) d.push(`текст: ${clip(p.text, 200)}`);
  } else if (/readWriteFile$/.test(t)) {
    d.push(`${p.operation || 'read'}: ${clip(p.fileSelector || p.fileName, 200)}`);
  }

  // Модели и промпты — полностью: это основной материал для Prompt Guide.
  const model = rl(p.model) || rl(p.modelId);
  if (model) d.push(`модель: ${model}`);
  if (p.options && Object.keys(p.options).length && /lc\.|langchain/.test(t)) d.push('параметры: ' + full(JSON.stringify(maskValue(p.options))));
  const prompts = [];
  const msgs = (p.responses && p.responses.values) || (p.messages && (p.messages.values || p.messages.messageValues)) || [];
  msgs.forEach((m) => prompts.push([`сообщение ${m.role || 'user'}`, m.content || m.message || '']));
  if (p.text && /langchain/.test(t)) prompts.push(['вход text', p.text]);
  if (p.options && p.options.systemMessage) prompts.push(['systemMessage', p.options.systemMessage]);
  if (p.systemMessage) prompts.push(['systemMessage', p.systemMessage]);
  const attrs = (p.attributes && p.attributes.attributes) || [];
  attrs.forEach((a) => prompts.push([`атрибут ${a.name}${a.type ? ' (' + a.type + ')' : ''}${a.required ? ', обязателен' : ''}`, a.description || '']));
  if (p.schemaType || p.inputSchema) prompts.push(['схема', p.inputSchema || p.schemaType]);
  for (const [label, text] of prompts) d.push(`\n      [${label}]\n${indent(full(text), '      > ')}`);
  return d;
}

function describe({ file, w }, idToName) {
  const out = [];
  const nodes = w.nodes.filter((n) => n.type !== 'n8n-nodes-base.stickyNote');
  const stickies = w.nodes.filter((n) => n.type === 'n8n-nodes-base.stickyNote');
  const byName = Object.fromEntries(nodes.map((n) => [n.name, n]));
  const s = w.settings || {};
  out.push(`\n## ${rel(file)} — ${w.name}`);
  out.push(`id: ${w.id || '—'} | active: ${w.active} | нод: ${nodes.length} | sticky: ${stickies.length}`);
  const st = [];
  if (s.errorWorkflow) st.push(`errorWorkflow: ${idToName[s.errorWorkflow] || s.errorWorkflow}`);
  if (s.timezone) st.push(`timezone: ${s.timezone}`);
  if (s.callerPolicy) st.push(`callerPolicy: ${s.callerPolicy}`);
  if (s.executionOrder) st.push(`executionOrder: ${s.executionOrder}`);
  out.push('настройки: ' + (st.join(' | ') || 'нет'));

  // Основные связи (main) и подключаемые (ai_languageModel, ai_tool и т.п.).
  const incoming = new Set();
  const attached = [];
  for (const [src, conn] of Object.entries(w.connections)) {
    for (const [kind, outputs] of Object.entries(conn)) {
      (outputs || []).forEach((arr) => (arr || []).forEach((x) => {
        if (kind === 'main') incoming.add(x.node);
        else attached.push(`${src} → ${x.node} (${kind})`);
      }));
    }
  }
  const attachedNames = new Set(attached.map((a) => a.split(' → ')[0]));
  const starts = nodes.filter((n) => /trigger/i.test(n.type) || (!incoming.has(n.name) && !attachedNames.has(n.name)));

  // Обход графа в ширину для чтения. Это не расписание выполнения n8n.
  const order = [];
  const seen = new Set();
  const queue = starts.map((n) => n.name);
  while (queue.length) {
    const name = queue.shift();
    if (seen.has(name) || !byName[name]) continue;
    seen.add(name);
    order.push(name);
    const main = (w.connections[name] && w.connections[name].main) || [];
    main.forEach((arr) => (arr || []).forEach((x) => queue.push(x.node)));
  }
  nodes.filter((n) => !seen.has(n.name) && !attachedNames.has(n.name)).forEach((n) => order.push(n.name));

  out.push('\nноды (обход графа; фактический порядок зависит от ветвей, циклов и настроек n8n):');
  order.forEach((name, i) => {
    const n = byName[name];
    const d = details(n, idToName);
    out.push(`${i + 1}. «${name}» [${short(n.type)}]` + (d.length ? '\n' + d.map((x) => x.startsWith('\n') ? x.slice(1) : '   - ' + x).join('\n') : ''));
    const main = (w.connections[name] && w.connections[name].main) || [];
    const labels = outputLabels(n);
    main.forEach((arr, k) => {
      const targets = (arr || []).map((x) => `${x.node} (вход ${x.index === undefined ? 0 : x.index})`);
      const label = labels[k] || (main.length > 1 ? `выход ${k}` : '');
      out.push(`   → ${label ? label + ': ' : ''}${targets.length ? targets.join(', ') : '(никуда)'}`);
    });
  });

  if (attached.length) {
    out.push('\nподключаемые ноды:');
    for (const a of attached) {
      const name = a.split(' → ')[0];
      const n = byName[name];
      const d = n ? details(n, idToName) : [];
      out.push(`- ${a} [${n ? short(n.type) : '?'}]` + (d.length ? '\n' + d.map((x) => x.startsWith('\n') ? x.slice(1) : '   - ' + x).join('\n') : ''));
    }
  }

  if (withSticky && stickies.length) {
    out.push('\nsticky-заметки:');
    for (const n of stickies) out.push(`--- «${n.name}»\n${full((n.parameters && n.parameters.content) || '').trim()}`);
  }
  return out.join('\n');
}

const workflows = loadWorkflows();
if (!workflows.length) {
  console.log(mask(`В ${root} экспортов n8n не найдено.`));
  process.exit(0);
}
const idToName = Object.fromEntries(workflows.filter(({ w }) => w.id).map(({ w }) => [w.id, w.name]));
console.log(`# Экспорты n8n: ${workflows.length} (${rel(root) || '.'})`);
console.log('\n| Файл | Имя | id | active | нод | триггеры |\n|---|---|---|---|---|---|');
for (const { file, w } of workflows) {
  const nodes = w.nodes.filter((n) => n.type !== 'n8n-nodes-base.stickyNote');
  const triggers = nodes.filter((n) => /trigger/i.test(n.type)).map((n) => short(n.type)).join(', ');
  console.log(mask(`| ${rel(file)} | ${w.name} | ${w.id || '—'} | ${w.active} | ${nodes.length} | ${triggers || '—'} |`));
}
for (const wf of workflows) console.log(mask(describe(wf, idToName)));

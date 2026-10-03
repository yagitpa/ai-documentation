// Общие шаблоны секретов для check-docs.js и scan-n8n.js.
// Секрет — значение, которое само даёт доступ. Данные инстанса (домены, ID, chat_id) секретами не считаются.

const SECRET_PATTERNS = [
  ['OpenAI/Anthropic key', /\bsk-(ant-)?[A-Za-z0-9_-]{16,}/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['AWS key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{30,}/],
  ['Telegram bot token', /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/],
  ['Bearer token', /Bearer\s+[A-Za-z0-9._~+\/-]{8,}/i],
  ['Private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----[^]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/],
  ['Connection password', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/i],
  ['Assigned secret', /\b(?:authorization|x-api-key|password|passwd|(?:access[_-]?|refresh[_-]?|auth[_-]?)?token|api[_-]?key|client[_-]?secret|secret)\b["']?\s*[=:]\s*(?:"[^"\n]+"|'[^'\n]+'|\$\{[^}]+\}|\{\{[^]*?\}\}|<[^>]+>|[^\s,;}&]+)/i],
];

// Имена заголовков и параметров, значение которых — доступ.
const SECRET_FIELD = /^(authorization|x-api-key|api[_-]?key|apikey|(?:access[_-]?|refresh[_-]?|auth[_-]?)?token|secret|password|passwd|client[_-]?secret)$/i;
const PLACEHOLDER = /^(?:<[^>]*>|\$\{[^}]+\}|\{\{[^]*\}\}|process\.env\.[\w]+|os\.environ[^]*|\$env:[\w]+|null|undefined|[xX*]+)$/;
const assigned = SECRET_PATTERNS.find(([name]) => name === 'Assigned secret')[1];

function isPlaceholder(value) { return PLACEHOLDER.test(String(value).trim()); }

function findSecret(text) {
  // В экспортированном JSON строка может содержать ещё один JSON с экранированными ключами.
  const candidates = [String(text)];
  for (let i = 0; i < 3 && candidates[candidates.length - 1].includes('\\"'); i++) {
    candidates.push(candidates[candidates.length - 1].replace(/\\"/g, '"'));
  }
  for (const candidate of candidates) {
    for (const [name, re] of SECRET_PATTERNS) {
      for (const match of candidate.matchAll(new RegExp(re.source, re.flags + 'g'))) {
        if (name === 'Assigned secret' && isPlaceholder(match[0].replace(/^.*?[=:]\s*/, '').replace(/^["']|["']$/g, ''))) continue;
        return name;
      }
    }
  }
  return null;
}

// Заменяет найденные секреты в строке на пометку, остальной текст сохраняет.
function mask(text) {
  let out = String(text);
  for (const [name, re] of SECRET_PATTERNS) {
    out = out.replace(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'), (matched) => {
      if (re === assigned) {
        const prefix = (matched.match(/^.*?[=:]\s*/) || [''])[0];
        const value = matched.slice(prefix.length).replace(/^["']|["']$/g, '');
        if (isPlaceholder(value)) return matched;
        return prefix + '"<секрет скрыт>"';
      }
      return `<секрет скрыт: ${name}>`;
    });
  }
  if (out.includes('\\"')) {
    const decoded = out.replace(/\\"/g, '"');
    if (findSecret(decoded)) return mask(decoded);
  }
  return out;
}

// Структурированные параметры: имя поля даёт контекст даже для короткого пароля.
function maskValue(value) {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      // Не меняем формат JSON-промптов, если маскировать нечего.
      const sanitized = typeof parsed === 'object' && parsed !== null ? maskValue(parsed) : parsed;
      if (JSON.stringify(sanitized) === JSON.stringify(parsed)) return mask(value);
      // Для обычных JSON-литералов сохраняем исходные пробелы и переводы строк.
      const patched = value.replace(/("(?:\\.|[^"\\])*"\s*:\s*)("(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?|true|false|null)/g, (whole, prefix, literal) => {
        const key = JSON.parse(prefix.slice(0, prefix.lastIndexOf(':')).trim());
        const v = JSON.parse(literal);
        return SECRET_FIELD.test(key) && v !== null && v !== '' && !isPlaceholder(v) ? prefix + '"<секрет скрыт>"' : whole;
      });
      // Объект/массив в поле-секрете требует структурной замены всего значения.
      if (JSON.stringify(maskValue(JSON.parse(patched))) !== JSON.stringify(JSON.parse(patched))) return JSON.stringify(sanitized);
      return mask(patched);
    } catch (e) { return mask(value); }
  }
  if (Array.isArray(value)) return value.map(maskValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key,
      SECRET_FIELD.test(key) && v !== null && v !== '' && !isPlaceholder(v) ? '<секрет скрыт>' : maskValue(v)]));
  }
  return value;
}

module.exports = { SECRET_PATTERNS, SECRET_FIELD, findSecret, mask, maskValue };

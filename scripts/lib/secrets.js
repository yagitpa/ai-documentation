// Общие шаблоны секретов для check-docs.js и scan-n8n.js.
// Секрет — значение, которое само даёт доступ. Данные инстанса (домены, ID, chat_id) секретами не считаются.

const SECRET_PATTERNS = [
  ['OpenAI/Anthropic key', /\bsk-(ant-)?[A-Za-z0-9_-]{16,}/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{20,}/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['AWS key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{30,}/],
  ['Telegram bot token', /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/],
  ['Bearer token', /Bearer\s+[A-Za-z0-9._-]{20,}/],
  ['Private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Assigned secret', /\b(password|passwd|token|api[_-]?key|secret)\b\s*[=:]\s*["']?[A-Za-z0-9_\-./+]{8,}/i],
];

// Имена заголовков и параметров, значение которых — доступ.
const SECRET_FIELD = /^(authorization|x-api-key|api[_-]?key|apikey|token|access[_-]?token|secret|password|client[_-]?secret)$/i;

function findSecret(text) {
  for (const [name, re] of SECRET_PATTERNS) if (re.test(text)) return name;
  return null;
}

// Заменяет найденные секреты в строке на пометку, остальной текст сохраняет.
function mask(text) {
  let out = String(text);
  for (const [name, re] of SECRET_PATTERNS) {
    out = out.replace(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'), `<секрет скрыт: ${name}>`);
  }
  return out;
}

module.exports = { SECRET_PATTERNS, SECRET_FIELD, findSecret, mask };

#!/usr/bin/env node
// Проверка project-docs/ по пунктам 1–8 и 12 references/quality-checklist.md.
// Запуск:
//   node check-docs.js <корень проекта>            — проверка
//   node check-docs.js <корень проекта> --hashes   — хэши документов для поля sha256 манифеста
// Код выхода: 0 — нарушений нет, 1 — есть нарушения, 2 — папка project-docs/ не найдена.
// Только читает файлы и выполняет `git rev-parse HEAD`. Значения найденных секретов не выводит.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { SECRET_PATTERNS } = require('./lib/secrets');

const args = process.argv.slice(2);
const hashesMode = args.includes('--hashes');
const root = path.resolve(args.find((a) => !a.startsWith('--')) || '.');
const docsDir = path.join(root, 'project-docs');
if (!fs.existsSync(docsDir)) {
  console.error(`Нет папки ${docsDir}`);
  process.exit(2);
}

const SERVICE = ['README.md', 'open-questions.md', 'CHANGELOG.md', 'manifest.yaml'];
const HEADER_FIELDS = ['Назначение', 'Аудитория', 'Статус', 'Обновлён', 'Источники'];

const read = (p) => fs.readFileSync(p, 'utf8');
const rel = (p) => path.relative(root, p).split(path.sep).join('/');
// Хэш по содержимому с нормализованными переводами строк: git autocrlf не должен давать ложных «ручных правок».
const hashOf = (p) => crypto.createHash('sha256').update(read(p).replace(/\r\n/g, '\n')).digest('hex');

const files = fs.readdirSync(docsDir).filter((f) => fs.statSync(path.join(docsDir, f)).isFile());
const mdFiles = files.filter((f) => f.endsWith('.md'));
const docFiles = mdFiles.filter((f) => !SERVICE.includes(f));

if (hashesMode) {
  for (const f of docFiles) console.log(`${f}: ${hashOf(path.join(docsDir, f))}`);
  process.exit(0);
}

const issues = [];
const warn = (item, msg) => issues.push(`[${item}] ${msg}`);

// Строки вне fenced-блоков кода: TODO, ссылки и заголовки внутри них не проверяются.
function outsideFences(text) {
  let inFence = false;
  return text.split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; return null; }
    return inFence ? null : line;
  });
}

// Журнал вопросов: ID → статус, ответ, назначение.
const questions = {};
const oqPath = path.join(docsDir, 'open-questions.md');
if (!fs.existsSync(oqPath)) {
  warn(2, 'нет open-questions.md');
} else {
  const blocks = read(oqPath).split(/^### /m).slice(1);
  for (const b of blocks) {
    const id = (b.match(/^(Q-\d+)/) || [])[1];
    if (!id) continue;
    const status = ((b.match(/^- Статус:\s*(.+)$/m) || [])[1] || '').trim();
    const answer = ((b.match(/^- Ответ:[ \t]*(.*)$/m) || [])[1] || '').trim();
    const targets = ((b.match(/^- Куда по(?:йдёт|шёл) ответ:\s*(.+)$/m) || [])[1] || '');
    questions[id] = { status, answer, targets };
  }
  for (const [id, q] of Object.entries(questions)) {
    // 5: назначение ответа существует
    for (const m of q.targets.matchAll(/([\w.-]+\.(?:md|yaml))/g)) {
      if (!files.includes(m[1])) warn(5, `${id}: «Куда пойдёт ответ» указывает на несуществующий ${m[1]}`);
    }
    if (q.status === 'открыт' && q.answer) warn(5, `${id}: ответ заполнен, но не обработан — выполнить шаг 0`);
  }
}

// Манифест: документы с хэшами, служебные поля.
const manPath = path.join(docsDir, 'manifest.yaml');
const manifestDocs = {};
let manifest = '';
if (!fs.existsSync(manPath)) {
  warn(2, 'нет manifest.yaml');
} else {
  manifest = read(manPath);
  const docsSection = manifest.split(/^documents:\s*$/m)[1] || '';
  for (const block of docsSection.split(/^\s*-\s*file:\s*/m).slice(1)) {
    const file = block.split(/\s/)[0];
    const sha = (block.match(/^\s*sha256:\s*([0-9a-f]{64})/m) || [])[1] || null;
    manifestDocs[file] = sha;
  }
  // 2: состав по манифесту
  for (const f of Object.keys(manifestDocs)) if (!files.includes(f)) warn(2, `в манифесте есть ${f}, файла нет`);
  for (const f of docFiles) if (!(f in manifestDocs)) warn(2, `${f} нет в манифесте (допустимо, если файл существовал до скилла)`);

  // 12: служебные поля манифеста
  const updatedAt = ((manifest.match(/^updated_at:\s*(\S+)/m) || [])[1] || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(updatedAt)) warn(12, `updated_at «${updatedAt}» — нужны дата и время (ISO 8601)`);
  const commit = ((manifest.match(/^git_commit:\s*(\S+)/m) || [])[1] || 'null');
  let head = null;
  try { head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { head = null; }
  if (head && commit !== head) warn(12, `git_commit ${commit} не совпадает с HEAD ${head}`);
  if (!head && commit !== 'null') warn(12, `git недоступен, а git_commit = ${commit}`);
  for (const [f, sha] of Object.entries(manifestDocs)) {
    if (!files.includes(f)) continue;
    if (!sha) warn(12, `${f}: в манифесте нет sha256 — выполнить --hashes и перенести`);
    else if (sha !== hashOf(path.join(docsDir, f))) warn(12, `${f}: sha256 в манифесте не совпадает с файлом — хэши не обновлены после правок`);
  }
  // 12: CHANGELOG датирован днём updated_at
  const clPath = path.join(docsDir, 'CHANGELOG.md');
  if (fs.existsSync(clPath)) {
    const top = (read(clPath).match(/^## (\d{4}-\d{2}-\d{2})/m) || [])[1];
    if (top !== updatedAt.slice(0, 10)) warn(12, `верхняя запись CHANGELOG (${top || 'нет'}) не совпадает с датой updated_at (${updatedAt.slice(0, 10)})`);
  }
}
for (const f of SERVICE) if (!files.includes(f)) warn(2, `нет служебного файла ${f}`);

// 12: счётчик открытых вопросов в README
const readmePath = path.join(docsDir, 'README.md');
if (fs.existsSync(readmePath)) {
  const shown = (read(readmePath).match(/Открытых вопросов:\s*(\d+)/) || [])[1];
  const actual = Object.values(questions).filter((q) => ['открыт', 'конфликт'].includes(q.status)).length;
  if (shown === undefined) warn(12, 'в README.md нет счётчика «Открытых вопросов: N»');
  else if (Number(shown) !== actual) warn(12, `README.md: открытых вопросов ${shown}, в журнале ${actual}`);
}

for (const f of files) {
  const text = read(path.join(docsDir, f));

  // 1: секреты — по всем файлам, включая блоки кода
  text.split('\n').forEach((line, i) => {
    for (const [name, re] of SECRET_PATTERNS) {
      if (re.test(line)) warn(1, `${f}:${i + 1}: похоже на «${name}» — проверить строку`);
    }
  });

  if (!f.endsWith('.md')) continue;
  const lines = outsideFences(text);
  const plain = lines.filter((l) => l !== null).join('\n');

  // 8: следы шаблона
  if (/<!-- g:|%% g:/.test(text)) warn(8, `${f}: остались служебные комментарии шаблона`);

  // 6: относительные ссылки
  for (const m of plain.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = m[1].split('#')[0];
    if (!target || /^(https?:|mailto:)/.test(target)) continue;
    if (!fs.existsSync(path.resolve(docsDir, target))) warn(6, `${f}: битая ссылка ${m[1]}`);
  }

  // 7: пустые разделы
  lines.forEach((line, i) => {
    const h = line && line.match(/^(#{2,6}) /);
    if (!h) return;
    let j = i + 1;
    while (j < lines.length && lines[j] !== null && lines[j].trim() === '') j++;
    if (j >= lines.length) { warn(7, `${f}: пустой раздел «${line.trim()}» в конце файла`); return; }
    const next = lines[j] !== null && lines[j].match(/^(#{1,6}) /);
    if (next && next[1].length <= h[1].length) warn(7, `${f}: пустой раздел «${line.trim()}»`);
  });

  if (SERVICE.includes(f)) continue;

  // 3: шапка и источники
  const header = {};
  for (const m of text.matchAll(/^\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*$/gm)) header[m[1]] = m[2];
  if (!/^# .+/.test(text) || !/\|\s*Поле\s*\|\s*Значение\s*\|/.test(text)) {
    warn(3, `${f}: нет шапки документа`);
  } else {
    for (const field of HEADER_FIELDS) if (!(field in header)) warn(3, `${f}: в шапке нет поля «${field}»`);
    const src = header['Источники'] || '';
    for (const m of src.matchAll(/`([^`]+)`/g)) {
      const base = m[1].split('*')[0].replace(/[\\/]+$/, '');
      if (base && !fs.existsSync(path.join(root, base))) warn(3, `${f}: источник не найден — ${m[1]}`);
    }
    for (const m of src.matchAll(/Q-\d+/g)) if (!questions[m[0]]) warn(3, `${f}: источник ${m[0]} отсутствует в open-questions.md`);
  }

  // 4: метки TODO и статус
  const labels = [...plain.matchAll(/TODO \((Q-\d+)[^)]*\)/g)];
  const bare = (plain.match(/\bTODO\b(?! \(Q-\d+)/g) || []).length;
  if (bare) warn(4, `${f}: ${bare} меток TODO без номера вопроса`);
  for (const m of labels) {
    const st = questions[m[1]] && questions[m[1]].status;
    if (!['открыт', 'конфликт', 'пропущен'].includes(st)) warn(4, `${f}: TODO (${m[1]}) при статусе вопроса «${st || 'нет вопроса'}»`);
  }
  const status = header['Статус'] || '';
  const expected = labels.length === 0 ? 'заполнен' : `черновик, пробелов: ${labels.length}`;
  if (status && status !== expected) warn(4, `${f}: статус «${status}», ожидается «${expected}»`);
}

if (issues.length) {
  console.log(issues.join('\n'));
  console.log(`\nНарушений: ${issues.length}. Пункты 9–11 чек-листа проверить вручную.`);
  process.exit(1);
}
console.log(`${rel(docsDir)}: пункты 1–8 и 12 пройдены. Пункты 9–11 проверить вручную.`);

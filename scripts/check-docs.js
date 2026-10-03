#!/usr/bin/env node
// Проверка project-docs/ по пунктам 1–8 и 12 references/quality-checklist.md.
// Запуск:
//   node check-docs.js <корень проекта>            — проверка
//   node check-docs.js <корень проекта> --hashes   — хэши документов для поля sha256 манифеста
//   node check-docs.js <корень проекта> --answer-hashes — хэши рассмотренных ответов
// Код выхода: 0 — нарушений нет, 1 — есть нарушения, 2 — папка project-docs/ не найдена.
// Только читает файлы. Значения найденных секретов не выводит.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { findSecret } = require('./lib/secrets');
const { readManifest } = require('./lib/manifest');
const { parseQuestions, answerHash } = require('./lib/questions');

const args = process.argv.slice(2);
const hashesMode = args.includes('--hashes');
const answersMode = args.includes('--answer-hashes');
const root = path.resolve(args.find((a) => !a.startsWith('--')) || '.');
const docsDir = path.join(root, 'project-docs');
if (!fs.existsSync(docsDir)) {
  console.error(`Нет папки ${docsDir}`);
  process.exit(2);
}
if (fs.lstatSync(docsDir).isSymbolicLink() || fs.readdirSync(docsDir).some((f) => fs.lstatSync(path.join(docsDir, f)).isSymbolicLink())) {
  console.error('project-docs/: symlink/junction не читаются. Нужны обычные файлы внутри папки проекта.');
  process.exit(1);
}

const SERVICE = ['README.md', 'open-questions.md', 'CHANGELOG.md', 'manifest.yaml'];
const HEADER_FIELDS = ['Назначение', 'Аудитория', 'Статус', 'Обновлён', 'Источники'];

const read = (p) => fs.readFileSync(p, 'utf8');
const rel = (p) => path.relative(root, p).split(path.sep).join('/');
// Хэш по содержимому с нормализованными переводами строк: git autocrlf не должен давать ложных «ручных правок».
const hashOf = (p) => crypto.createHash('sha256').update(read(p).replace(/\r\n/g, '\n')).digest('hex');

const files = fs.readdirSync(docsDir).filter((f) => fs.lstatSync(path.join(docsDir, f)).isFile());
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
let questions = Object.create(null);
const oqPath = path.join(docsDir, 'open-questions.md');
if (!fs.existsSync(oqPath)) {
  warn(2, 'нет open-questions.md');
} else {
  const parsed = parseQuestions(read(oqPath));
  questions = parsed.questions;
  for (const id of parsed.duplicates) warn(5, `${id}: повторный ID вопроса`);
  if (answersMode) {
    for (const [id, q] of Object.entries(questions)) console.log(`${id}: ${answerHash(q.answer)}`);
    process.exit(0);
  }
  for (const [id, q] of Object.entries(questions)) {
    if (!['открыт', 'отвечен', 'применён', 'пропущен', 'конфликт', 'уточнение'].includes(q.status)) warn(5, `${id}: неизвестный статус`);
    if (!q.targets) warn(5, `${id}: нет назначения ответа`);
    // Несколько назначений разделяются точкой с запятой; каждый содержит файл → раздел.
    for (const target of q.targets.split(';').filter((s) => s.trim())) {
      const filename = (target.match(/([\w.-]+\.(?:md|yaml))/) || [])[1];
      const section = target.split('→').slice(1).join('→').trim().replace(/^[«"']|[»"']$/g, '');
      if (!filename || !files.includes(filename)) { warn(5, `${id}: несуществующий файл назначения`); continue; }
      if (filename === 'manifest.yaml') {
        if (!['профиль', 'profile'].includes(section)) warn(5, `${id}: назначение в манифесте должно быть «профиль»`);
      } else {
        const headings = outsideFences(read(path.join(docsDir, filename))).filter(Boolean)
          .filter((line) => /^#{1,6} /.test(line)).map((line) => line.replace(/^#{1,6} /, '').trim());
        if (!section || !headings.includes(section)) warn(5, `${id}: раздел назначения не существует в ${filename}`);
      }
    }
    if ((q.status === 'открыт' && q.answer) || q.status === 'отвечен') warn(5, `${id}: ответ заполнен, но не обработан — выполнить шаг 0`);
    if (['уточнение', 'конфликт'].includes(q.status) && q.answer && q.handledHash !== answerHash(q.answer)) {
      warn(5, `${id}: новый или изменённый ответ требует обработки — выполнить шаг 0`);
    }
  }
}

// Манифест: документы с хэшами, служебные поля.
const manPath = path.join(docsDir, 'manifest.yaml');
const manifestDocs = Object.create(null);
let manifest = null;
if (!fs.existsSync(manPath)) {
  warn(2, 'нет manifest.yaml');
} else {
  try { manifest = readManifest(manPath); }
  catch (e) { warn(2, 'manifest.yaml: неверный YAML или структура (содержимое ошибки скрыто)'); }
  for (const doc of manifest ? manifest.documents : []) manifestDocs[doc.file] = doc.sha256;
  // 2: состав по манифесту
  for (const f of Object.keys(manifestDocs)) if (!files.includes(f)) warn(2, `в манифесте есть ${f}, файла нет`);
  for (const f of docFiles) if (!(f in manifestDocs)) warn(2, `${f} нет в манифесте (допустимо, если файл существовал до скилла)`);

  // 12: служебные поля манифеста
  const updatedAt = manifest && manifest.updated_at;
  if (typeof updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(updatedAt) || !Number.isFinite(Date.parse(updatedAt))) {
    warn(12, 'updated_at — нужны дата, время и часовой пояс (ISO 8601)');
  }
  const commit = manifest && manifest.git_commit;
  if (commit !== null && (typeof commit !== 'string' || !/^[0-9a-f]{40,64}$/.test(commit))) warn(12, 'git_commit — хэш последнего полного анализа или null');
  if (manifest && ![1, 2].includes(manifest.version)) warn(2, 'неподдерживаемая версия манифеста');
  if (manifest && manifest.version === 2) {
    for (const doc of manifest.documents) {
      if (!doc.source_hashes || !Array.isArray(doc.sources)) warn(12, `${doc.file}: нужны sources и source_hashes`);
      if (typeof doc.manual_review_required !== 'boolean') warn(12, `${doc.file}: нужен постоянный признак manual_review_required`);
    }
  }
  for (const [f, sha] of Object.entries(manifestDocs)) {
    if (!files.includes(f)) continue;
    if (typeof sha !== 'string' || !/^[0-9a-f]{64}$/.test(sha)) warn(12, `${f}: в манифесте нет sha256 — выполнить --hashes и перенести`);
    else if (sha !== hashOf(path.join(docsDir, f))) warn(12, `${f}: sha256 в манифесте не совпадает с файлом — хэши не обновлены после правок`);
  }
  // 12: CHANGELOG датирован днём updated_at
  const clPath = path.join(docsDir, 'CHANGELOG.md');
  if (fs.existsSync(clPath)) {
    const top = (read(clPath).match(/^## (\d{4}-\d{2}-\d{2})/m) || [])[1];
    if (typeof updatedAt === 'string' && top !== updatedAt.slice(0, 10)) warn(12, 'верхняя запись CHANGELOG не совпадает с датой updated_at');
  }
}
for (const f of SERVICE) if (!files.includes(f)) warn(2, `нет служебного файла ${f}`);

// 12: счётчик открытых вопросов в README
const readmePath = path.join(docsDir, 'README.md');
if (fs.existsSync(readmePath)) {
  const shown = (read(readmePath).match(/Открытых вопросов:\s*(\d+)/) || [])[1];
  const actual = Object.values(questions).filter((q) => ['открыт', 'отвечен', 'конфликт', 'уточнение'].includes(q.status)).length;
  if (shown === undefined) warn(12, 'в README.md нет счётчика «Открытых вопросов: N»');
  else if (Number(shown) !== actual) warn(12, `README.md: открытых вопросов ${shown}, в журнале ${actual}`);
}

for (const f of files) {
  const text = read(path.join(docsDir, f));

  // 1: секреты — по всем файлам, включая блоки кода
  text.split('\n').forEach((line, i) => {
    const name = findSecret(line);
    if (name) warn(1, `${f}:${i + 1}: похоже на «${name}» — проверить строку`);
  });

  if (!f.endsWith('.md')) continue;
  const lines = outsideFences(text);
  const plain = lines.filter((l) => l !== null).join('\n');

  let manualDepth = 0;
  for (const marker of plain.matchAll(/<!--\s*(\/?)manual\s*-->/g)) {
    if (marker[1]) { if (manualDepth !== 1) warn(8, `${f}: закрывающий manual без открывающего`); manualDepth = 0; }
    else { if (manualDepth) warn(8, `${f}: вложенные блоки manual`); manualDepth = 1; }
  }
  if (manualDepth) warn(8, `${f}: блок manual не закрыт`);

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
  for (const m of text.split(/^## /m)[0].matchAll(/^\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*$/gm)) header[m[1]] = m[2];
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
    if (!['открыт', 'конфликт', 'уточнение', 'пропущен'].includes(st)) warn(4, `${f}: TODO (${m[1]}) при статусе вопроса «${st || 'нет вопроса'}»`);
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

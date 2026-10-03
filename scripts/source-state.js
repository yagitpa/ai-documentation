#!/usr/bin/env node
// Только чтение. Текущее состояние источников и признаки ручных правок; вывод JSON.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readManifest } = require('./lib/manifest');
const { safePath, walk } = require('./lib/project-files');

const root = path.resolve(process.argv[2] || '.');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const rel = (p) => path.relative(root, p).split(path.sep).join('/');

function snapshot(sources) {
  const values = Object.create(null);
  for (const source of sources || []) {
    if (/^Q-\d+$/.test(source)) continue;
    const absolute = safePath(root, source);
    if (!absolute) continue; // секретные файлы: путь допустим в docs, содержимое не читается
    if (!fs.existsSync(absolute)) { values[source] = null; continue; }
    const files = fs.statSync(absolute).isDirectory() ? walk(root, absolute) : [absolute];
    for (const file of files) values[rel(file)] = hash(fs.readFileSync(file));
  }
  return Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b)));
}

try {
  const docsDir = path.join(root, 'project-docs');
  if (fs.lstatSync(docsDir).isSymbolicLink() || fs.lstatSync(path.join(docsDir, 'manifest.yaml')).isSymbolicLink()) throw new Error('symlink');
  const manifest = readManifest(path.join(root, 'project-docs', 'manifest.yaml'));
  const documents = manifest.documents.map((doc) => {
    const current = snapshot(doc.sources);
    const old = doc.source_hashes;
    const changed = old === undefined || [...new Set([...Object.keys(old), ...Object.keys(current)])]
      .some((p) => old[p] !== current[p]);
    const docPath = path.join(root, 'project-docs', doc.file);
    const text = fs.existsSync(docPath) && !fs.lstatSync(docPath).isSymbolicLink() ? fs.readFileSync(docPath, 'utf8') : null;
    const manual = doc.manual_review_required === true || (manifest.version === 1 && text !== null) || (text !== null &&
      (hash(text.replace(/\r\n/g, '\n')) !== doc.sha256 || text.includes('<!-- manual -->')));
    return { file: doc.file, changed, source_hashes: current, manual_review_required: manual };
  });
  console.log(JSON.stringify({ documents }, null, 2));
} catch (e) {
  // Не выводим YAML-фрагменты: ошибка парсера может содержать секрет.
  console.error('Не удалось прочитать манифест или источники. Проверьте пути и структуру manifest.yaml.');
  process.exitCode = 1;
}

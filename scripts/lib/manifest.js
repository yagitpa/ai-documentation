const fs = require('fs');
const yaml = require('../vendor/js-yaml');

function readManifest(file) {
  // JSON_SCHEMA: даты остаются строками, нет исполняемых или пользовательских тегов.
  const data = yaml.load(fs.readFileSync(file, 'utf8'), { schema: yaml.JSON_SCHEMA });
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('manifest must be a mapping');
  if (!Array.isArray(data.documents)) throw new Error('documents must be a sequence');
  const names = new Set();
  for (const doc of data.documents) {
    if (!doc || typeof doc.file !== 'string' || !/^[\w.-]+\.md$/.test(doc.file) || names.has(doc.file)) {
      throw new Error('invalid or duplicate document file');
    }
    names.add(doc.file);
    if (doc.sources !== undefined && (!Array.isArray(doc.sources) || doc.sources.some((s) => typeof s !== 'string'))) {
      throw new Error('sources must be strings');
    }
    if (doc.manual_review_required !== undefined && typeof doc.manual_review_required !== 'boolean') {
      throw new Error('manual_review_required must be boolean');
    }
    if (doc.source_hashes !== undefined && (!doc.source_hashes || typeof doc.source_hashes !== 'object' || Array.isArray(doc.source_hashes) ||
        Object.values(doc.source_hashes).some((h) => h !== null && !/^[0-9a-f]{64}$/.test(h)))) {
      throw new Error('source_hashes must contain SHA256 or null');
    }
  }
  return data;
}

module.exports = { readManifest };

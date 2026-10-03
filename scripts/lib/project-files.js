const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set(['node_modules', '.git', 'venv', '.venv', 'env', '__pycache__',
  'dist', 'build', 'out', 'target', '.next', '.cache', 'coverage', 'vendor', 'project-docs']);
const ENV_EXAMPLES = new Set(['.env.example', '.env.sample', '.env.template']);

function forbiddenName(name) {
  const n = name.toLowerCase();
  return ((n === '.env' || n.startsWith('.env.')) && !ENV_EXAMPLES.has(n)) ||
    /\.(pem|key|p12|keystore)$/.test(n) || /^(credentials.*\.json|secrets\..*|service-account.*\.json)$/.test(n);
}

// Не следуем symlink/junction и не читаем файлы из запрещённых каталогов.
function safePath(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) return null;
  const parts = relative.replace(/\\/g, '/').split('/');
  if (parts.some((p) => p === '..' || SKIP_DIRS.has(p.toLowerCase()))) return null;
  if (forbiddenName(parts[parts.length - 1])) return null;
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    try { if (fs.lstatSync(current).isSymbolicLink()) return null; }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return current;
}

function walk(root, dir = root) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name.toLowerCase())) out.push(...walk(root, path.join(dir, e.name)));
    } else if (e.isFile() && !forbiddenName(e.name)) out.push(path.join(dir, e.name));
  }
  return out.sort();
}

module.exports = { forbiddenName, safePath, walk };

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function read(name, fallback) {
  try {
    const raw = fs.readFileSync(filePath(name), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      write(name, fallback);
      return fallback;
    }
    throw err;
  }
}

// Write to a temp file first so a crash mid-write can never truncate the store.
function write(name, value) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const target = filePath(name);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, target);
  return value;
}

function nextId(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
}

module.exports = { read, write, nextId, DATA_DIR };

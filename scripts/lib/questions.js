const crypto = require('crypto');
const answerHash = (answer) => crypto.createHash('sha256').update(answer.replace(/\r\n/g, '\n').trim()).digest('hex');

function parseQuestions(text) {
  const questions = Object.create(null);
  const duplicates = [];
  for (const block of text.split(/^### /m).slice(1)) {
    const id = (block.match(/^(Q-\d+)/) || [])[1];
    if (!id) continue;
    const field = (name) => ((block.match(new RegExp('^- ' + name + ':[ \\t]*(.*)$', 'm')) || [])[1] || '').trim();
    // Ответ продолжается до следующего поля или заголовка.
    const lines = block.split('\n');
    const start = lines.findIndex((line) => /^- Ответ:/.test(line));
    const answerLines = start < 0 ? [] : [lines[start].replace(/^- Ответ:[ \t]*/, '')];
    for (let i = start + 1; start >= 0 && i < lines.length; i++) {
      if (/^(?:- [^\n:]+:|#{1,6} )/.test(lines[i])) break;
      answerLines.push(lines[i]);
    }
    const answer = answerLines.join('\n').trim();
    if (questions[id]) duplicates.push(id);
    questions[id] = { status: field('Статус'), answer,
      targets: field('Куда пойдёт ответ') || field('Куда пошёл ответ'),
      handledHash: field('Обработанный ответ sha256') };
  }
  return { questions, duplicates };
}

module.exports = { parseQuestions, answerHash };

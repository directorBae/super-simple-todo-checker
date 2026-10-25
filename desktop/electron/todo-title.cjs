function titleFields(title, notes = '') {
  const original = String(title || '').trim(), clean = original.replace(/\s+/g, ' '), chars = Array.from(clean);
  if (chars.length <= 50) return { title: clean, notes };
  const source = `원문: ${original}`;
  return { title: chars.slice(0, 49).join('').trimEnd() + '…', notes: String(notes).includes(source) ? notes : [notes, source].filter(Boolean).join('\n\n') };
}
module.exports = { titleFields };

// Ctrl+Z (⌘Z) undoes the last change to the to-dos; Ctrl+Shift+Z or Ctrl+Y (⌘⇧Z) redoes it.
// Keys are read by position (e.code), so it also works while typing in Korean (e.key would be 'ㅋ').
// In a text field the browser's own text undo is used only once something has been typed there since it got focus;
// otherwise — e.g. the empty new line the notebook leaves the caret on — Ctrl+Z undoes the last to-do change.
const field = (el) => (el instanceof Element ? el.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])') : null);
const typedIn = new WeakSet();

document.addEventListener('focusin', (e) => { const f = field(e.target); if (f) typedIn.delete(f); });
document.addEventListener('input', (e) => { const f = field(e.target); if (f) typedIn.add(f); });

window.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const undo = e.code === 'KeyZ' && !e.shiftKey, redo = (e.code === 'KeyZ' && e.shiftKey) || (e.code === 'KeyY' && !e.shiftKey);
  if (!undo && !redo) return;
  const f = field(e.target);
  if (f && typedIn.has(f)) return; // the field's own text undo
  const run = redo ? window.api?.redoTodo : window.api?.undoTodo;
  if (!run) return;
  e.preventDefault();
  run();
});

// Clipboard shortcuts the terminal has to claim itself on Windows.
//
// On macOS ⌘C/⌘V never reach the shell: xterm ignores meta chords and the
// webview's native copy/paste handles them. On Windows the same shortcuts are
// Ctrl chords, and xterm turns those into control bytes — Ctrl+C sent ^C even
// with text selected, Ctrl+V sent a literal ^V — so copy and paste simply did
// not work. This follows Windows Terminal's convention:
//
//   Ctrl+C        copy if there is a selection, otherwise ^C (interrupt) as usual
//   Ctrl+Shift+C  always copy
//   Ctrl+V        paste
//   Ctrl+Shift+V  paste
//   Ctrl+Insert / Shift+Insert   copy / paste (classic Windows console keys)

export type ClipboardKeyAction = "copy" | "paste" | null;

type KeyLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey">;

export function clipboardKeyAction(
  e: KeyLike,
  hasSelection: boolean,
  isWindows: boolean,
): ClipboardKeyAction {
  if (!isWindows || e.altKey || e.metaKey) return null;
  const k = e.key.toLowerCase();

  if (e.ctrlKey) {
    if (k === "c") return e.shiftKey || hasSelection ? "copy" : null;
    if (k === "v") return "paste";
    if (k === "insert" && !e.shiftKey) return "copy";
    return null;
  }
  if (e.shiftKey && k === "insert") return "paste";
  return null;
}

// Shift+Left / Shift+Right keyboard selection (Windows), like Word or a Windows
// Terminal prompt: type "Molecule", hold Shift, tap Left — the word highlights,
// and Ctrl+C copies it (clipboardKeyAction sees a selection → "copy").
//
// The terminal does this itself rather than trusting the program at the prompt:
// PSReadLine selects natively, but Claude Code and cmd.exe don't, and either way
// their highlight is just painted cells that xterm can't copy. So the keystroke
// still goes through to the program (PSReadLine keeps its own selection, and
// typing over it still replaces), and xterm mirrors the range on top of it.
//
// Positions are LINEAR buffer offsets (row * cols + col), so a selection walks
// across a wrapped line the same way the cursor does.

/** -1 for Shift+Left, 1 for Shift+Right, null for anything else. */
export function shiftArrowDir(e: KeyLike): -1 | 1 | null {
  if (!e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return null;
  if (e.key === "ArrowLeft") return -1;
  if (e.key === "ArrowRight") return 1;
  return null;
}

/** Keys that only modify — pressing Shift (or Ctrl, on the way to Ctrl+C) must
 *  not end a keyboard selection that's in progress. */
export function isModifierOnly(e: Pick<KeyboardEvent, "key">): boolean {
  return e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta";
}

/** Column just past the last non-blank cell of buffer row `row` (0 = blank row). */
export type RowTextEnd = (row: number) => number;

/** The blank cells after a line's text are not text: a highlight running into
 *  them reads as "selected empty space" (Word stops at the last letter). Pull a
 *  selection END that sits in that trailing blank run back to the text's end,
 *  row by row, so a range ending on an empty row stops at the previous row's
 *  text. Spaces BETWEEN words are kept — only the blank tail is dropped. */
function clipToText(start: number, end: number, cols: number, textEnd: RowTextEnd): number {
  while (end > start) {
    const row = Math.floor((end - 1) / cols);
    const te = row * cols + textEnd(row);
    if (end <= te) break;
    end = Math.max(start, te);
    if (te > row * cols) break;
  }
  return end;
}

/** Selected cells between the anchor (cursor when selection began) and the head
 *  (where the arrows have moved it): `start` offset and `length`, or null when
 *  nothing — or only the blank tail after the text — is covered. */
export function keySelRange(
  anchor: number,
  head: number,
  cols: number,
  textEnd: RowTextEnd,
): { start: number; length: number } | null {
  const start = Math.min(anchor, head);
  const end = clipToText(start, Math.max(anchor, head), cols, textEnd);
  return end > start ? { start, length: end - start } : null;
}

/** Where Shift+Left/Right moves the selection head. Right stops at the end of
 *  the text on the head's row — the program's cursor stops there too, so a head
 *  that kept walking into blank cells would drift away from it and need as many
 *  extra Left presses to come back. */
export function moveKeySelHead(head: number, dir: -1 | 1, cols: number, textEnd: RowTextEnd): number {
  if (dir < 0) return Math.max(0, head - 1);
  const row = Math.floor(head / cols);
  return head < row * cols + textEnd(row) ? head + 1 : head;
}

import { describe, it, expect } from "vitest";
import { clipboardKeyAction, isModifierOnly, keySelRange, moveKeySelHead, shiftArrowDir } from "./termKeys";

const key = (k: string, mods: Partial<Record<"ctrlKey" | "shiftKey" | "altKey" | "metaKey", boolean>> = {}) => ({
  key: k,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...mods,
});

describe("clipboardKeyAction on Windows", () => {
  it("Ctrl+C copies when text is selected", () => {
    expect(clipboardKeyAction(key("c", { ctrlKey: true }), true, true)).toBe("copy");
  });

  it("Ctrl+C without a selection still goes to the shell as an interrupt", () => {
    expect(clipboardKeyAction(key("c", { ctrlKey: true }), false, true)).toBeNull();
  });

  it("Ctrl+Shift+C always copies (key arrives upper-case with Shift)", () => {
    expect(clipboardKeyAction(key("C", { ctrlKey: true, shiftKey: true }), false, true)).toBe("copy");
  });

  it("Ctrl+V and Ctrl+Shift+V paste", () => {
    expect(clipboardKeyAction(key("v", { ctrlKey: true }), false, true)).toBe("paste");
    expect(clipboardKeyAction(key("V", { ctrlKey: true, shiftKey: true }), false, true)).toBe("paste");
  });

  it("Ctrl+Insert copies and Shift+Insert pastes", () => {
    expect(clipboardKeyAction(key("Insert", { ctrlKey: true }), true, true)).toBe("copy");
    expect(clipboardKeyAction(key("Insert", { shiftKey: true }), false, true)).toBe("paste");
  });

  it("leaves other Ctrl chords and AltGr combos alone", () => {
    expect(clipboardKeyAction(key("d", { ctrlKey: true }), true, true)).toBeNull();
    // AltGr reports as Ctrl+Alt on Windows keyboards.
    expect(clipboardKeyAction(key("v", { ctrlKey: true, altKey: true }), false, true)).toBeNull();
  });
});

describe("clipboardKeyAction elsewhere", () => {
  it("does nothing off Windows — ⌘C/⌘V are native there and Ctrl+C is ^C", () => {
    expect(clipboardKeyAction(key("c", { ctrlKey: true }), true, false)).toBeNull();
    expect(clipboardKeyAction(key("v", { ctrlKey: true }), false, false)).toBeNull();
  });
});

describe("Shift+arrow keyboard selection", () => {
  it("recognises Shift+Left / Shift+Right only", () => {
    expect(shiftArrowDir(key("ArrowLeft", { shiftKey: true }))).toBe(-1);
    expect(shiftArrowDir(key("ArrowRight", { shiftKey: true }))).toBe(1);
    expect(shiftArrowDir(key("ArrowLeft"))).toBeNull();
    // Ctrl+Shift+Left is word-select in PSReadLine — leave it to the shell.
    expect(shiftArrowDir(key("ArrowLeft", { shiftKey: true, ctrlKey: true }))).toBeNull();
    expect(shiftArrowDir(key("ArrowUp", { shiftKey: true }))).toBeNull();
  });

  // 80 columns; row 0 holds "PS C:\> Molecule" with the text ending at col 18
  // ("Molecule" at offsets 10..17), row 1 is empty, row 2 is full and wraps
  // into row 3, whose text ends at col 5.
  const COLS = 80;
  const ends: Record<number, number> = { 0: 18, 1: 0, 2: 80, 3: 5 };
  const textEnd = (row: number) => ends[row] ?? 0;

  it("selecting left covers the characters before the cursor", () => {
    // cursor at 18; three Shift+Left
    expect(keySelRange(18, 15, COLS, textEnd)).toEqual({ start: 15, length: 3 });
  });

  it("selecting right covers the characters from the cursor on", () => {
    expect(keySelRange(10, 12, COLS, textEnd)).toEqual({ start: 10, length: 2 });
  });

  it("returning to the anchor selects nothing", () => {
    expect(keySelRange(18, 18, COLS, textEnd)).toBeNull();
  });

  it("the highlight stops at the last letter, not in the empty space after it", () => {
    // anchor parked past the text (a program that leaves its cursor there)
    expect(keySelRange(30, 12, COLS, textEnd)).toEqual({ start: 12, length: 6 });
    // a range that is nothing but blank tail selects nothing
    expect(keySelRange(30, 25, COLS, textEnd)).toBeNull();
    // ending on an empty row stops at the previous row's text
    expect(keySelRange(15, 85, COLS, textEnd)).toEqual({ start: 15, length: 3 });
  });

  it("a wrapped line keeps its full first row and clips only the last", () => {
    expect(keySelRange(170, 250, COLS, textEnd)).toEqual({ start: 170, length: 75 });
  });

  it("Shift+Right stops at the end of the text; Shift+Left still moves", () => {
    expect(moveKeySelHead(17, 1, COLS, textEnd)).toBe(18);
    expect(moveKeySelHead(18, 1, COLS, textEnd)).toBe(18);
    expect(moveKeySelHead(18, -1, COLS, textEnd)).toBe(17);
    expect(moveKeySelHead(0, -1, COLS, textEnd)).toBe(0);
    // across the wrap from a full row into its continuation
    expect(moveKeySelHead(239, 1, COLS, textEnd)).toBe(240);
    expect(moveKeySelHead(240, 1, COLS, textEnd)).toBe(241);
  });

  it("holding Shift or Ctrl doesn't end a selection", () => {
    expect(isModifierOnly({ key: "Shift" })).toBe(true);
    expect(isModifierOnly({ key: "Control" })).toBe(true);
    expect(isModifierOnly({ key: "c" })).toBe(false);
  });
});

import type { InlineRange } from "../../lib/format-actions";

export function readEditableText(el: HTMLElement): string {
  let output = "";
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      output += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    if (element.tagName === "BR") {
      output += "\n";
      return;
    }
    const isBlock = element.tagName === "DIV" || element.tagName === "P";
    if (isBlock && output.length > 0 && !output.endsWith("\n")) output += "\n";
    for (const child of Array.from(element.childNodes)) visit(child);
    if (isBlock) output += "\n";
  };
  for (const child of Array.from(el.childNodes)) visit(child);
  return output;
}

export function getSelectionOffsets(element: HTMLElement): InlineRange {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !element.contains(selection.anchorNode)) {
    const end = readEditableText(element).length;
    return { start: end, end };
  }
  const offset = (node: Node, position: number) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.setEnd(node, position);
    const contents = range.cloneContents();
    const fragment = document.createElement("div");
    fragment.append(contents);
    return readEditableText(fragment).length;
  };
  if (selection.anchorNode === null || selection.focusNode === null) {
    const end = readEditableText(element).length;
    return { start: end, end };
  }
  const a = offset(selection.anchorNode, selection.anchorOffset);
  const f = offset(selection.focusNode, selection.focusOffset);
  return { start: Math.min(a, f), end: Math.max(a, f) };
}

export function getCaretOffset(element: HTMLElement): number {
  return getSelectionOffsets(element).start;
}

export function restoreSelection(element: HTMLElement, range: InlineRange): void {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  let remaining = range.start;
  let startNode: Node = element;
  let startOffset = 0;
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      startNode = node;
      startOffset = remaining;
      break;
    }
    remaining -= length;
    node = walker.nextNode();
  }
  if (!node && element.lastChild) {
    startNode = element.lastChild;
    startOffset = startNode.textContent?.length ?? 0;
  }
  const sel = window.getSelection();
  const domRange = document.createRange();
  domRange.setStart(startNode, startOffset);
  remaining = range.end - range.start;
  let endNode = startNode;
  let endOffset = startOffset;
  while (remaining > 0 && endNode !== element) {
    const len = endNode.textContent?.length ?? 0;
    if (endOffset + remaining <= len) {
      endOffset += remaining;
      remaining = 0;
    } else {
      remaining -= len - endOffset;
      const next = walker.nextNode();
      if (!next) break;
      endNode = next;
      endOffset = 0;
    }
  }
  domRange.setEnd(endNode, endOffset);
  sel?.removeAllRanges();
  sel?.addRange(domRange);
}

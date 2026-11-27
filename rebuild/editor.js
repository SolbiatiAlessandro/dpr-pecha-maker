import { pageType, sanitizeHTML } from "./document.js";
const PX = 96;
const textNodes = (root) => {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT),
    nodes = [];
  while (w.nextNode()) if (w.currentNode.length) nodes.push(w.currentNode);
  return nodes;
};
function point(root, offset) {
  const nodes = textNodes(root);
  for (const node of nodes) {
    if (offset <= node.length) return [node, offset];
    offset -= node.length;
  }
  return nodes.length ? [nodes.at(-1), nodes.at(-1).length] : [root, 0];
}
function offset(root, node, position) {
  const r = document.createRange();
  r.selectNodeContents(root);
  try {
    r.setEnd(node, position);
    return r.toString().length;
  } catch {
    return 0;
  }
}
function fragmentAt(p, start, end) {
  const r = document.createRange();
  r.setStart(...point(p, start));
  r.setEnd(...point(p, end));
  const copy = p.cloneNode(false);
  copy.append(r.cloneContents());
  return copy;
}
export class VisualEditor {
  constructor(root, onChange, onSelection) {
    this.root = root;
    this.onChange = onChange;
    this.onSelection = onSelection;
    this.savedSelection = null;
    this.rendering = false;
    root.addEventListener("input", () => {
      if (this.rendering) return;
      this.doc.html = this.collect();
      const sel = this.selection();
      this.render(this.doc, sel);
      onChange();
    });
    root.addEventListener("paste", (e) => {
      if (!e.target.closest(".page-editor")) return;
      e.preventDefault();
      const html = e.clipboardData.getData("text/html"),
        plain = e.clipboardData.getData("text/plain");
      document.execCommand(
        "insertHTML",
        false,
        html
          ? sanitizeHTML(html)
          : plain
              .split("\n")
              .map((t) => {
                const p = document.createElement("p");
                p.textContent = t;
                return p.outerHTML;
              })
              .join(""),
      );
    });
    document.addEventListener("selectionchange", () => {
      const s = this.selection();
      if (s) {
        this.savedSelection = s;
        onSelection?.();
      }
    });
  }
  editors() {
    return [...this.root.querySelectorAll(".page-editor")];
  }
  selection() {
    const s = getSelection();
    if (
      !s.rangeCount ||
      !this.root.contains(s.anchorNode) ||
      !this.root.contains(s.focusNode)
    )
      return null;
    const r = s.getRangeAt(0);
    let start = 0,
      end = 0,
      foundStart = false,
      foundEnd = false;
    for (const e of this.editors()) {
      if (e.contains(r.startContainer)) {
        start += offset(e, r.startContainer, r.startOffset);
        foundStart = true;
      } else if (!foundStart) start += e.textContent.length;
      if (e.contains(r.endContainer)) {
        end += offset(e, r.endContainer, r.endOffset);
        foundEnd = true;
      } else if (!foundEnd) end += e.textContent.length;
    }
    return foundStart && foundEnd ? { start, end } : null;
  }
  restore(s = this.savedSelection) {
    if (!s) return;
    const editors = this.editors();
    const find = (at) => {
      for (let i = 0; i < editors.length; i++) {
        const len = editors[i].textContent.length;
        if (at <= len || i === editors.length - 1)
          return { editor: editors[i], point: point(editors[i], at) };
        at -= len;
      }
    };
    const a = find(s.start),
      b = find(s.end);
    if (!a || !b) return;
    a.editor.focus({ preventScroll: true });
    const r = document.createRange();
    r.setStart(...a.point);
    r.setEnd(...b.point);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    this.savedSelection = s;
  }
  collect() {
    const host = document.createElement("div");
    for (const e of this.editors())
      for (const child of [...e.childNodes]) {
        let p = child.cloneNode(true);
        if (p.nodeType !== 1 || p.tagName !== "P") {
          const wrap = document.createElement("p");
          wrap.append(p);
          p = wrap;
        }
        if (
          p.dataset.continuation &&
          host.lastElementChild &&
          !p.dataset.hardBreak
        ) {
          host.lastElementChild.append(...p.childNodes);
        } else {
          delete p.dataset.continuation;
          host.append(p);
        }
      }
    return sanitizeHTML(host.innerHTML);
  }
  page(index, forPrint = false) {
    const d = this.doc,
      type = pageType(d, index),
      t = d.types[type],
      paper = document.createElement("section");
    paper.className = "paper";
    paper.dataset.type = type;
    paper.dataset.page = index + 1;
    paper.setAttribute(
      "aria-label",
      `${type[0].toUpperCase() + type.slice(1)} page ${index + 1}`,
    );
    const margin = d.paper.margin * PX,
      boxW = (d.paper.width - 2 * d.paper.margin) * PX,
      boxH = d.pecha
        ? d.height * PX
        : (d.paper.height - 2 * d.paper.margin) * PX;
    paper.style.width = d.paper.width * PX + "px";
    paper.style.height =
      (d.compact && d.pecha ? d.height + 2 * d.paper.margin : d.paper.height) *
        PX +
      "px";
    if (d.marginsVisible && !forPrint) {
      const m = document.createElement("div");
      m.className = "paper-margin";
      Object.assign(m.style, {
        left: margin + "px",
        right: margin + "px",
        top: margin + "px",
        bottom: margin + "px",
      });
      paper.append(m);
    }
    if (d.pecha && t.style !== "none") {
      const frame = document.createElement("div");
      frame.className = "pecha-frame";
      frame.style.cssText = `left:${margin}px;top:${margin}px;width:${boxW}px;height:${boxH}px;--frame-color:${d.hints && !forPrint ? { title: "red", fancy: "green", body: "blue" }[type] : t.color};--double-gap:${d.doubleGap * PX}px;--side-width:${t.outer * PX}px`;
      frame.innerHTML =
        '<div class="frame-outer"></div>' +
        (t.style === "double" ? '<div class="frame-inner"></div>' : "") +
        '<div class="side-rule left"></div><div class="side-rule right"></div>';
      if (t.inner) {
        for (const side of ["left", "right"]) {
          const rule = document.createElement("div");
          rule.className = "side-rule " + side;
          rule.style[side] = (t.outer + t.inner) * PX + "px";
          frame.append(rule);
        }
      }
      if (t.insideOn) {
        const inner = document.createElement("div");
        inner.className = "frame-inner";
        inner.style.inset = t.inside * PX + "px";
        frame.append(inner);
      }
      paper.append(frame);
    }
    const editor = document.createElement("div");
    editor.className =
      "page-editor" + (d.baselines && !forPrint ? " baselines" : "");
    editor.contentEditable = !forPrint;
    editor.spellcheck = false;
    editor.setAttribute("role", "textbox");
    editor.setAttribute("aria-label", `Page ${index + 1} text`);
    editor.setAttribute("aria-multiline", "true");
    const line = (d.pecha ? t.lineHeight : d.line.height) * PX,
      side = d.pecha ? (t.outer + t.inner + t.side) * PX : 0,
      top = d.pecha ? t.top * PX : d.line.baseline * PX;
    Object.assign(editor.style, {
      left: margin + side + "px",
      top: margin + top - line * 0.78 + "px",
      width: boxW - 2 * side + "px",
      height: (d.pecha ? t.lines * line : boxH - top) + "px",
      lineHeight: line + "px",
      fontFamily: d.font,
      fontSize: d.size + "pt",
      tabSize: d.line.tab * PX + "px",
      fontKerning: d.line.kerning ? "normal" : "none",
    });
    editor.style.setProperty("--line-height", line + "px");
    paper.append(editor);
    if (
      d.pecha &&
      d.number.start &&
      (type !== "title" ||
        (d.number.title && (index !== 0 || d.number.firstTitle)))
    ) {
      const n = document.createElement("span");
      n.className = "page-number" + (d.number.angle === 90 ? " rotated" : "");
      n.textContent = d.number.start + index;
      Object.assign(n.style, {
        right: margin + d.number.inset * PX + "px",
        top:
          d.number.position === "center"
            ? margin + boxH / 2 + "px"
            : margin + boxH - d.number.inset * PX - 20 + "px",
        fontSize: d.number.size + "pt",
      });
      paper.append(n);
    }
    if (
      d.pecha &&
      d.folio.start &&
      index % 2 === 0 &&
      (type !== "title" || d.folio.title)
    ) {
      const f = document.createElement("span");
      f.className = "folio-number";
      const num = d.folio.start + Math.floor(index / 2);
      f.textContent =
        typeof Folio !== "undefined" ? Folio.words(num) : String(num);
      Object.assign(f.style, {
        left: margin + d.folio.inset * PX + "px",
        top: margin + boxH / 2 + "px",
        fontSize: d.folio.size + "pt",
      });
      paper.append(f);
    }
    return { paper, editor };
  }
  render(doc, selection = null) {
    this.rendering = true;
    this.doc = doc;
    this.root.replaceChildren();
    const source = document.createElement("div");
    source.innerHTML = sanitizeHTML(doc.html);
    const queue = [...source.children];
    let index = 0,
      current = this.page(index);
    this.root.append(current.paper);
    let empty = true;
    const advance = () => {
      current = this.page(++index);
      this.root.append(current.paper);
      empty = true;
    };
    while (queue.length) {
      const p = queue.shift();
      if (p.dataset.hardBreak) {
        current.editor.append(p);
        advance();
        continue;
      }
      current.editor.append(p);
      const available = parseFloat(current.editor.style.height),
        bottom = () => p.offsetTop + p.getBoundingClientRect().height;
      if (bottom() <= available + 0.5) {
        empty = false;
        continue;
      }
      const count = p.textContent.length;
      p.remove();
      if (!count) {
        if (!empty) {
          advance();
          queue.unshift(p);
        } else {
          current.editor.append(p);
          empty = false;
        }
        continue;
      }
      let lo = 0,
        hi = count;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2),
          part = fragmentAt(p, 0, mid);
        current.editor.append(part);
        const fits =
          part.offsetTop + part.getBoundingClientRect().height <=
          available + 0.5;
        part.remove();
        if (fits) lo = mid;
        else hi = mid - 1;
      }
      if (lo === 0 && !empty) {
        advance();
        queue.unshift(p);
        continue;
      }
      if (lo === 0) lo = 1;
      if (lo < count) {
        const text = p.textContent.slice(0, lo);
        const boundary = Math.max(
          text.lastIndexOf(" "),
          text.lastIndexOf("་"),
          text.lastIndexOf("\t"),
        );
        if (boundary > lo * 0.5) lo = boundary + 1;
      }
      const first = fragmentAt(p, 0, lo);
      current.editor.append(first);
      empty = false;
      if (lo < count) {
        const rest = fragmentAt(p, lo, count);
        rest.dataset.continuation = "true";
        queue.unshift(rest);
        advance();
      }
    }
    for (const e of this.editors())
      if (!e.childNodes.length) e.innerHTML = "<p><br></p>";
    this.rendering = false;
    if (selection) this.restore(selection);
  }
  format(properties) {
    const s = this.selection() || this.savedSelection;
    if (!s) return;
    this.restore(s);
    if (s.start === s.end) {
      const span = document.createElement("span");
      Object.assign(span.style, properties);
      span.textContent = "\u200b";
      const r = getSelection().getRangeAt(0);
      r.insertNode(span);
      r.setStart(span.firstChild, 1);
      r.collapse(true);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    } else {
      const all = this.editors().flatMap(textNodes);
      let at = 0;
      for (const node of all) {
        const length = node.length,
          a = Math.max(0, s.start - at),
          b = Math.min(length, s.end - at);
        at += length;
        if (b <= a) continue;
        const r = document.createRange();
        r.setStart(node, a);
        r.setEnd(node, b);
        const span = document.createElement("span");
        Object.assign(span.style, properties);
        span.append(r.extractContents());
        r.insertNode(span);
      }
    }
    this.doc.html = this.collect();
    this.render(
      this.doc,
      s.start === s.end ? { start: s.start + 1, end: s.end + 1 } : s,
    );
    this.onChange();
  }
  align(value) {
    this.restore();
    const sel = getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    for (const p of this.root.querySelectorAll(".page-editor p"))
      if (range.intersectsNode(p)) p.style.textAlign = value;
    const s = this.selection();
    this.doc.html = this.collect();
    this.render(this.doc, s);
    this.onChange();
  }
  selectAll() {
    const length = this.editors().reduce((n, e) => n + e.textContent.length, 0);
    this.restore({ start: 0, end: length });
  }
  print(target) {
    target.replaceChildren();
    const editors = this.editors();
    const d = this.doc;
    let sheet,
      slot = 0;
    for (let i = 0; i < editors.length; i++) {
      if (!sheet || slot === (d.pecha ? d.placement.count : 1)) {
        sheet = document.createElement("section");
        sheet.className = "paper print-sheet";
        sheet.style.width = d.paper.width * PX + "px";
        sheet.style.height = d.paper.height * PX + "px";
        target.append(sheet);
        slot = 0;
      }
      const { paper, editor } = this.page(i, true);
      editor.innerHTML = editors[i].innerHTML;
      const total = d.placement.count * d.height * PX,
        top = d.placement.center
          ? (d.paper.height * PX - total) / 2
          : d.paper.margin * PX;
      paper.style.cssText = `position:absolute;left:0;top:${d.pecha ? top + slot * d.height * PX - d.paper.margin * PX : 0}px;width:${d.paper.width * PX}px;height:${d.paper.height * PX}px;background:transparent;box-shadow:none;overflow:visible`;
      sheet.append(paper);
      slot++;
    }
    let style = document.querySelector("#print-size");
    if (!style) {
      style = document.createElement("style");
      style.id = "print-size";
      document.head.append(style);
    }
    style.textContent = `@page{size:${d.paper.width}in ${d.paper.height}in;margin:0}`;
  }
}

export const clone = (value) => JSON.parse(JSON.stringify(value));
export function newDocument() {
  const type = (lines = 6) => ({
    lines,
    lineHeight: 0.38,
    top: 0.25,
    side: 0.03,
    outer: 0.5,
    inner: 0,
    insideOn: false,
    inside: 0.4,
    style: "double",
    color: "#000000",
  });
  return {
    format: "pechamaker-web-desktop",
    version: 1,
    name: "Untitled",
    html: "<p><br></p>",
    font: "Times New Roman",
    size: 12,
    pecha: true,
    compact: false,
    hints: true,
    marginsVisible: true,
    baselines: false,
    paper: { width: 8.5, height: 11, margin: 0.5 },
    height: 2.5,
    doubleGap: 0.04,
    counts: { title: 0, fancy: 0 },
    types: { title: type(2), fancy: type(4), body: type() },
    line: {
      height: 0.38,
      baseline: 0.3,
      tab: 0.5,
      raise: 0.11,
      kerning: false,
    },
    number: {
      start: 1,
      title: false,
      firstTitle: false,
      angle: 90,
      position: "bottom",
      inset: 0.05,
      size: 10,
    },
    folio: { start: 1, title: false, size: 14, inset: 0.1, jyon: false },
    placement: { count: 1, center: false },
  };
}
export function sanitizeHTML(html) {
  const source = document.createElement("div");
  source.innerHTML = html;
  const allowed = new Set([
    "P",
    "DIV",
    "BR",
    "SPAN",
    "B",
    "STRONG",
    "I",
    "EM",
    "U",
    "S",
    "SUB",
    "SUP",
  ]);
  for (const node of [...source.querySelectorAll("*")]) {
    if (
      ["SCRIPT", "STYLE", "IFRAME", "OBJECT", "SVG", "MATH"].includes(
        node.tagName,
      )
    ) {
      node.remove();
      continue;
    }
    if (!allowed.has(node.tagName)) {
      node.replaceWith(...node.childNodes);
      continue;
    }
    const style = node.style,
      keep = {};
    for (const key of [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "fontStyle",
      "textDecoration",
      "color",
      "textAlign",
    ])
      if (style[key] && !/url|var\(/i.test(style[key])) keep[key] = style[key];
    const hard = node.getAttribute("data-hard-break");
    for (const a of [...node.attributes]) node.removeAttribute(a.name);
    Object.assign(node.style, keep);
    if (hard === "true") node.dataset.hardBreak = "true";
  }
  const blocks = [];
  let pending = document.createElement("p");
  for (const node of [...source.childNodes]) {
    if (node.nodeType === 1 && ["P", "DIV"].includes(node.tagName)) {
      if (pending.childNodes.length) {
        blocks.push(pending);
        pending = document.createElement("p");
      }
      const p = document.createElement("p");
      p.style.cssText = node.style.cssText;
      if (node.dataset.hardBreak) p.dataset.hardBreak = "true";
      p.append(...node.childNodes);
      blocks.push(p);
    } else pending.append(node);
  }
  if (pending.childNodes.length) blocks.push(pending);
  return blocks.map((p) => p.outerHTML).join("") || "<p><br></p>";
}
export function loadDocument(input) {
  if (input?.format !== "pechamaker-web-desktop" || input.version !== 1)
    throw Error(
      "This rebuild opens its own .pecha-web documents and plain text. Native PXP import is not connected yet.",
    );
  const d = newDocument();
  // Only known settings are accepted; prototype-bearing objects and arbitrary CSS are not used.
  function merge(target, source) {
    for (const key of Object.keys(target)) {
      if (!(key in source)) continue;
      if (target[key] && typeof target[key] === "object")
        merge(target[key], source[key] || {});
      else if (typeof source[key] === typeof target[key])
        target[key] = source[key];
    }
  }
  merge(d, input);
  d.html = sanitizeHTML(d.html);
  validate(d);
  return d;
}
export function validate(d) {
  const bounded = (value, min, max, label) => {
    if (!Number.isFinite(value) || value < min || value > max)
      throw Error(`${label} must be between ${min} and ${max}.`);
  };
  bounded(d.paper.width, 3, 30, "Paper width");
  bounded(d.paper.height, 3, 40, "Paper height");
  bounded(
    d.paper.margin,
    0,
    Math.min(d.paper.width, d.paper.height) / 3,
    "Paper margin",
  );
  bounded(d.height, 0.5, d.paper.height - 2 * d.paper.margin, "Pecha height");
  bounded(d.doubleGap, 0.01, 0.2, "Double line thickness");
  bounded(d.size, 4, 144, "Font size");
  for (const [name, t] of Object.entries(d.types)) {
    bounded(
      t.lines,
      1,
      name === "title" ? 6 : name === "fancy" ? 12 : 20,
      "Lines",
    );
    bounded(t.lineHeight, 0.05, 2, "Line height");
    bounded(t.top, 0, d.height, "Top margin");
    bounded(
      t.outer,
      0,
      (d.paper.width - 2 * d.paper.margin) / 3,
      "Outer side box",
    );
    bounded(t.side, 0, 0.5, "Side margin");
    bounded(t.inner, 0, 1, "Inner side box");
    bounded(t.inside, 0, 1, "Inside box inset");
    if (2 * (t.outer + t.inner + t.side) >= d.paper.width - 2 * d.paper.margin)
      throw Error("Side boxes and margins leave no room for text.");
    if (!["double", "single", "none"].includes(t.style))
      throw Error("Invalid line style");
  }
  bounded(d.counts.title, 0, 99, "Title count");
  bounded(d.counts.fancy, 0, 100, "Fancy count");
  bounded(
    d.placement.count,
    1,
    Math.floor((d.paper.height - 2 * d.paper.margin) / d.height),
    "Pecha pages per sheet",
  );
  bounded(d.number.start, 0, 9999, "Beginning page number");
  bounded(d.folio.start, 0, 999, "Beginning folio number");
}
export function pageType(d, index) {
  return index < d.counts.title
    ? "title"
    : index < d.counts.title + d.counts.fancy
      ? "fancy"
      : "body";
}
export function syntheticExample() {
  const d = newDocument();
  d.name = "Formatting example";
  d.font = "Times New Roman";
  d.size = 20;
  d.html =
    '<p style="text-align:center"><span style="font-size:24pt">PechaMaker</span></p><p>A direct visual editing example.</p><p><b>Bold text</b> and regular text retain their formatting.</p><p><span style="font-family:Jomolhari">བོད་ཡིག་དཔེ་མཚོན།</span></p><p>Select some text, then choose Format → Font.</p><p>Layout Controls changes the frame and text spacing.</p><p>This paragraph continues on the following pecha page.</p>';
  return d;
}

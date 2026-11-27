import { clone, validate } from "./document.js";
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const get = (o, path) => path.split(".").reduce((v, k) => v[k], o);
const set = (o, path, value) => {
  const p = path.split("."),
    key = p.pop();
  p.reduce((v, k) => v[k], o)[key] = value;
};
export class Dialogs {
  constructor(getDoc, applyDoc, editor, checkpoint) {
    this.getDoc = getDoc;
    this.applyDoc = applyDoc;
    this.editor = editor;
    this.checkpoint = checkpoint;
    this.el = document.querySelector("#dialog");
    this.content = document.querySelector("#dialog-content");
    this.form = this.el.querySelector("form");
    this.form.addEventListener("submit", (e) => {
      if (e.submitter?.value === "cancel") return;
      e.preventDefault();
      if (this.apply()) this.el.close("ok");
    });
    document.querySelector("#apply").onclick = () => this.apply();
    this.el.addEventListener("close", () => this.editor.restore());
  }
  number(label, path, min = 0, max = 100, step = 0.01) {
    return `<label class="field"><span>${label}</span><span><input aria-label="${esc(label)}" name="${path}" type="number" min="${min}" max="${max}" step="${step}" value="${get(this.draft, path)}"></span></label>`;
  }
  check(label, path) {
    return `<label class="row"><input type="checkbox" name="${path}" ${get(this.draft, path) ? "checked" : ""}>${label}</label>`;
  }
  select(label, path, values) {
    return `<label class="field"><span>${label}</span><select name="${path}" aria-label="${esc(label)}">${values.map(([v, t]) => `<option value="${v}" ${String(get(this.draft, path)) === String(v) ? "selected" : ""}>${t}</option>`).join("")}</select></label>`;
  }
  open(kind) {
    this.kind = kind;
    this.draft = clone(this.getDoc());
    this.dirty = new Set();
    this.tab = "style";
    this.fontValues = {
      fontFamily: this.getDoc().font,
      fontSize: this.getDoc().size + "pt",
      fontWeight: "normal",
      fontStyle: "normal",
      textDecoration: "none",
      color: "#000000",
    };
    this.content.onchange = (e) => {
      const n = e.target;
      if (n.name) {
        if (kind === "font") {
          this.dirty.add(n.name);
          this.fontValues[n.name] = n.value;
        } else
          set(
            this.draft,
            n.name,
            n.type === "checkbox"
              ? n.checked
              : n.type === "number"
                ? Number(n.value)
                : n.dataset.number
                  ? Number(n.value)
                  : n.value,
          );
      }
    };
    this.render();
    this.el.showModal();
  }
  render() {
    const d = this.draft,
      N = this.number.bind(this),
      C = this.check.bind(this),
      S = this.select.bind(this);
    let html = "",
      title = "";
    if (this.kind === "layout") {
      title = "Pecha Layout Controls";
      html = `<div class="tabs" role="tablist">${[
        ["style", "Style"],
        ["title", "Title"],
        ["fancy", "Fancy"],
        ["body", "Body"],
        ["folio", "Folio Numbers"],
        ["number", "Page Numbers"],
      ]
        .map(
          ([v, t]) =>
            `<button type="button" role="tab" data-tab="${v}" aria-selected="${this.tab === v}">${t}</button>`,
        )
        .join("")}</div><div class="tab-panel">`;
      if (this.tab === "style") {
        html += `<fieldset><legend>Pecha Style Settings</legend><div class="columns"><div>${N("Pecha Height (all page types)", "height", 0.5, 30)}${N("Double Line Thickness", "doubleGap", 0.01, 0.2)}<fieldset><legend>Pecha Template Options</legend><div class="row">${[1, 2, 3].map((n) => `<label><input type="radio" name="preset" data-preset="${n}" ${n === 1 && !d.counts.title && !d.counts.fancy ? "checked" : ""}>Default ${n}</label>`).join("")}</div><p class="note">Saved layouts include the box and text adjustments for each Page Type.</p></fieldset></div><div>${N("Title page count", "counts.title", 0, 99, 1)}${N("Fancy page count", "counts.fancy", 0, 100, 1)}<p>Body &nbsp; * (remainder)</p><p class="note">Title count should be odd.<br>Fancy count should be even.<br><br>Dimensions are in inches.</p></div></div></fieldset>`;
      } else if (["title", "fancy", "body"].includes(this.tab)) {
        const k = this.tab,
          label = k[0].toUpperCase() + k.slice(1);
        html += `<div class="columns"><fieldset><legend>Text Adjustments for ${label} Pages</legend>${N(`Lines of Text on ${label} Pages`, `types.${k}.lines`, 1, k === "title" ? 6 : k === "fancy" ? 12 : 20, 1)}${N(`Line Height on ${label} Pages`, `types.${k}.lineHeight`, 0.05, 2)}${N("Top Margin (Box to top Baseline)", `types.${k}.top`, 0, 5)}${N("Side Margins (Box to Text)", `types.${k}.side`, 0, 0.5)}</fieldset><fieldset><legend>Box Drawing Adjustments for ${label} Pages</legend><div class="frame-style-row"><fieldset><legend>Line Style</legend><div class="row">${["double", "single", "none"].map((v) => `<label><input type="radio" name="types.${k}.style" value="${v}" ${d.types[k].style === v ? "checked" : ""}>${v[0].toUpperCase() + v.slice(1)}</label>`).join("")}</div></fieldset><fieldset><legend>Line Color</legend><input aria-label="Line Color" type="color" name="types.${k}.color" value="${d.types[k].color}"></fieldset></div>${N("Inner Side Box Width", `types.${k}.inner`, 0, 1)}${N("Outer Side Box Width", `types.${k}.outer`, 0, 2)}<div class="inside-box-row">${C("Use Inside Box", `types.${k}.insideOn`)}${N("Inset", `types.${k}.inside`, 0, 1)}</div></fieldset></div>`;
      } else if (this.tab === "number") {
        html += `<fieldset><legend>Arabic Page Numbers (appearing on the right side of the page)</legend>${N("Beginning Number", "number.start", 0, 9999, 1)}<p class="note">0 to disable</p>${C("Show Page Numbers on Title Pages", "number.title")}${C("also the first Title Page", "number.firstTitle")}<div class="columns"><div>${S(
          "Position",
          "number.position",
          [
            ["bottom", "Bottom"],
            ["center", "Center"],
          ],
        )}${S("Angle", "number.angle", [
          [0, "0°"],
          [90, "90°"],
        ])}</div><div>${N("Inset (inches)", "number.inset", 0, 1)}${N("Font Size", "number.size", 4, 72, 1)}</div></div></fieldset>`;
      } else
        html += `<fieldset><legend>Tibetan Folio Numbers (appearing on the left side of odd pages)</legend>${N("Beginning Number", "folio.start", 0, 999, 1)}<p class="note">0 to disable</p>${C("Show Folio Numbers on Title Pages", "folio.title")}${N("Font Size", "folio.size", 4, 72, 1)}${N("Inset (inches)", "folio.inset", 0, 1)}<p class="note">This web rebuild uses the bundled Unicode Jomolhari font. Original legacy font selection is pending.</p></fieldset>`;
      html += "</div>";
    } else if (this.kind === "font") {
      title = "Font";
      html = `<div class="font-columns"><label>Font:<select name="fontFamily" size="7">${["Times New Roman", "Arial", "Courier New", "Georgia", "Jomolhari"].map((f) => `<option ${f === this.fontValues.fontFamily ? "selected" : ""}>${f}</option>`).join("")}</select></label><label>Font style:<select name="fontWeight" size="7"><option value="normal">Regular</option><option value="bold">Bold</option></select></label><label>Size:<select name="fontSize" size="7">${[8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72].map((n) => `<option value="${n}pt" ${n + "pt" === this.fontValues.fontSize ? "selected" : ""}>${n}</option>`).join("")}</select></label></div><div class="columns"><fieldset><legend>Effects</legend><label class="row">Italic <select name="fontStyle"><option value="normal">No</option><option value="italic">Yes</option></select></label><label class="row">Decoration <select name="textDecoration"><option value="none">None</option><option value="underline">Underline</option><option value="line-through">Strikeout</option></select></label><label class="field">Color <input type="color" name="color" value="#000000"></label></fieldset><fieldset><legend>Sample</legend><div class="sample">AaBbYyZz</div></fieldset></div>`;
    } else if (this.kind === "line") {
      title = "Line Formatting";
      html = `<div class="columns"><fieldset><legend>Document-wide Settings (Pecha and Non-Pecha Modes)</legend>${N("Tab Width", "line.tab", 0.05, 3)}${C("Apply Kerning (slows the display)", "line.kerning")}<label class="field">Tibetan Font Adjustment <input type="number" value="0.11" disabled title="Not yet available"></label></fieldset><fieldset><legend>Non-Pecha Settings (no effect in Pecha Mode)</legend>${N("Line Height", "line.height", 0.05, 2)}${N("Baseline Adjustment", "line.baseline", 0, 2)}</fieldset></div>`;
    } else if (this.kind === "paper") {
      title = "Page Setup";
      html = `<fieldset><legend>Paper</legend>${N("Width (inches)", "paper.width", 3, 30)}${N("Height (inches)", "paper.height", 3, 40)}${N("Margins (inches)", "paper.margin", 0, 3)}<button type="button" id="landscape">Swap Portrait / Landscape</button></fieldset><p class="note">Select a printer or Save as PDF in the browser print dialog.</p>`;
    } else if (this.kind === "placement") {
      title = "Pecha Placement on the Paper";
      html = `<fieldset><legend>Vertical Placement</legend>${C("Centered between the Top and Bottom Margins", "placement.center")}<p>When unchecked: Single Pecha at the Top Margin</p></fieldset><fieldset><legend>Pecha Pages per Sheet</legend>${N("Pecha Pages per Sheet", "placement.count", 1, 20, 1)}</fieldset><p class="note">Horizontal Placement: Pecha pages always extend from the left paper margin to the right paper margin.</p>`;
    }
    document.querySelector("#dialog-title").textContent = title;
    this.content.innerHTML = html;
    this.content.querySelectorAll("[data-tab]").forEach(
      (b) =>
        (b.onclick = () => {
          this.tab = b.dataset.tab;
          this.render();
        }),
    );
    this.content.querySelectorAll("[data-preset]").forEach(
      (b) =>
        (b.onchange = (e) => {
          e.stopPropagation();
          const n = Number(b.dataset.preset);
          this.draft.counts = {
            title: n === 1 ? 0 : 1,
            fancy: n === 3 ? 2 : 0,
          };
          this.render();
        }),
    );
    this.content
      .querySelectorAll('select[name="number.angle"]')
      .forEach((n) => (n.dataset.number = "true"));
    const landscape = this.content.querySelector("#landscape");
    if (landscape)
      landscape.onclick = () => {
        [d.paper.width, d.paper.height] = [d.paper.height, d.paper.width];
        this.render();
      };
  }
  apply() {
    try {
      if (this.kind === "font") {
        const properties = Object.fromEntries(
          [...this.dirty].map((k) => [k, this.fontValues[k]]),
        );
        if (Object.keys(properties).length) {
          this.checkpoint();
          this.editor.format(properties);
          this.dirty.clear();
        }
      } else {
        validate(this.draft);
        this.checkpoint();
        this.applyDoc(clone(this.draft));
      }
      return true;
    } catch (e) {
      let error = this.content.querySelector(".dialog-error");
      if (!error) {
        error = document.createElement("p");
        error.className = "dialog-error";
        error.setAttribute("role", "alert");
        this.content.append(error);
      }
      error.textContent = e.message;
      return false;
    }
  }
}

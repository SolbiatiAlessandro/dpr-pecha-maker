import {
  newDocument,
  clone,
  loadDocument,
  syntheticExample,
  sanitizeHTML,
} from "./document.js";
import { VisualEditor } from "./editor.js";
import { Dialogs } from "./dialogs.js";
const $ = (s) => document.querySelector(s);
let doc = newDocument(),
  dirty = false,
  undo = [],
  redo = [],
  menu = null;
const checkpoint = () => {
  undo.push(clone(doc));
  if (undo.length > 100) undo.shift();
  redo = [];
};
const editor = new VisualEditor(
  $("#pages"),
  () => {
    dirty = true;
    updateStatus();
  },
  updateStatus,
);
const setDoc = (d) => {
  doc = d;
  editor.render(doc, editor.savedSelection);
  dirty = true;
  updateStatus();
};
const dialogs = new Dialogs(() => doc, setDoc, editor, checkpoint);
function updateStatus() {
  if (!editor.doc) return;
  $("#window-title").textContent =
    `PechaMaker - ${doc.name}${dirty ? " *" : ""}`;
  const s = getSelection(),
    node = s.anchorNode?.parentElement,
    p = node?.closest(".page-editor");
  if (p) {
    const style = getComputedStyle(node);
    if (!["font-size", "font-family"].includes(document.activeElement?.id)) {
      const family = style.fontFamily.split(",")[0].replaceAll('"', "");
      if ([...$("#font-family").options].some((o) => o.value === family))
        $("#font-family").value = family;
      $("#font-size").value = Math.round(parseFloat(style.fontSize) * 0.75);
    }
    $("#font-status").textContent =
      style.fontFamily.replaceAll('"', "") +
      ", " +
      Math.round(parseFloat(style.fontSize) * 0.75) +
      " pt";
    $("#page-status").textContent =
      `Page ${p.closest(".paper").dataset.page} of ${editor.editors().length}`;
  } else
    $("#page-status").textContent =
      `${editor.editors().length} page${editor.editors().length === 1 ? "" : "s"}`;
}
function save() {
  const file = { ...doc, html: editor.collect() },
    blob = new Blob([JSON.stringify(file, null, 2)], {
      type: "application/json",
    }),
    a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = doc.name.replace(/\.(pecha-web|txt)$/, "") + ".pecha-web";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  dirty = false;
  updateStatus();
  status("Saved in the web rebuild format (.pecha-web).");
}
function status(text) {
  $("#status").textContent = text;
}
function toggle(key) {
  checkpoint();
  doc[key] = !doc[key];
  editor.render(doc, editor.savedSelection);
  updateStatus();
}
function execute(command) {
  closeMenu();
  const actions = {
    new: () => {
      checkpoint();
      doc = { ...doc, name: "Untitled", html: "<p><br></p>" };
      editor.savedSelection = null;
      editor.render(doc);
      dirty = false;
      editor.restore({ start: 0, end: 0 });
      updateStatus();
    },
    open: () => $("#open-file").click(),
    save,
    print: () => {
      editor.print($("#print-pages"));
      window.print();
    },
    font: () => dialogs.open("font"),
    layout: () => dialogs.open("layout"),
    line: () => dialogs.open("line"),
    paper: () => dialogs.open("paper"),
    placement: () => dialogs.open("placement"),
    selectAll: () => editor.selectAll(),
    pecha: () => toggle("pecha"),
    compact: () => toggle("compact"),
    hints: () => toggle("hints"),
    baselines: () => toggle("baselines"),
    marginsVisible: () => toggle("marginsVisible"),
    toolbar: () => {
      $("#toolbar").hidden = !$("#toolbar").hidden;
      $("#toolbar").style.display = $("#toolbar").hidden ? "none" : "";
    },
    left: () => {
      checkpoint();
      editor.align("left");
    },
    right: () => {
      checkpoint();
      editor.align("right");
    },
    center: () => {
      checkpoint();
      editor.align("center");
    },
    justify: () => {
      checkpoint();
      editor.align("justify");
    },
    tab: () => {
      editor.restore();
      document.execCommand("insertText", false, "\t");
    },
    hardBreak: () => {
      checkpoint();
      editor.restore();
      document.execCommand(
        "insertHTML",
        false,
        '<p data-hard-break="true"></p><p><br></p>',
      );
    },
    copy: () => {
      editor.restore();
      document.execCommand("copy");
    },
    cut: () => {
      checkpoint();
      editor.restore();
      document.execCommand("cut");
    },
    paste: async () => {
      try {
        editor.restore();
        const text = await navigator.clipboard.readText();
        document.execCommand("insertText", false, text);
      } catch {
        status("Use Ctrl+V (or ⌘V) to paste into the document.");
      }
    },
    delete: () => {
      checkpoint();
      editor.restore();
      document.execCommand("delete");
    },
    removeReturns: () => {
      checkpoint();
      const e = document.createElement("div");
      e.innerHTML = doc.html;
      const p = document.createElement("p");
      for (const child of [...e.children]) {
        if (p.childNodes.length) p.append(" ");
        p.append(...child.childNodes);
      }
      doc.html = p.outerHTML;
      editor.render(doc);
      dirty = true;
    },
    goto: () => {
      const n = Number(
        prompt(`Go To Page (1–${editor.editors().length})`, "1"),
      );
      editor.editors()[n - 1]?.focus();
      editor.editors()[n - 1]?.scrollIntoView({ block: "center" });
    },
    example: () => {
      checkpoint();
      doc = syntheticExample();
      editor.savedSelection = null;
      editor.render(doc);
      dirty = false;
      updateStatus();
      status("Synthetic example — no private or copyrighted document content.");
    },
    about: () =>
      alert(
        "Independent web rebuild of the PechaMaker desktop workflow.\n\nBased on the original v2.0 guide and v2.9 resource labels. Native runtime parity has not yet been verified. Disabled commands are not implemented. Files save as .pecha-web, not native .pxp.\n\nOriginal PechaMaker: Frederick Johnson / pechamaker.com.",
      ),
  };
  actions[command]?.();
}
const item = (label, command, shortcut = "", check = null) => ({
  label,
  command,
  shortcut,
  check,
});
const unavailable = (label) => item(label, null);
const menus = {
  File: [
    item("New", "new", "Ctrl+N"),
    item("Open...", "open", "Ctrl+O"),
    unavailable("Close"),
    null,
    item("Save", "save", "Ctrl+S"),
    item("Save As...", "save"),
    unavailable("Save Content Only..."),
    unavailable("Save Annotations Only..."),
    unavailable("Save Template Only..."),
    unavailable("Auto Save..."),
    unavailable("Revert to Saved File"),
    null,
    unavailable("Export to RTF..."),
    unavailable("Import RTF file..."),
    unavailable("Import .DCT (TibetDoc) File..."),
    null,
    item("Print...", "print", "Ctrl+P"),
    item("Page and Printer Setup...", "paper"),
    unavailable("Exit"),
  ],
  Edit: [
    item("Copy", "copy", "Ctrl+C"),
    item("Cut", "cut", "Ctrl+X"),
    item("Paste", "paste", "Ctrl+V"),
    item("Delete", "delete"),
    item("Select All", "selectAll", "Ctrl+A"),
    null,
    item("Remove Hard Returns", "removeReturns"),
    item("Go To Page...", "goto", "Ctrl+G"),
    null,
    unavailable("Find Previous Format Code"),
    unavailable("Find Next Format Code"),
  ],
  Insert: [
    item("Tab", "tab"),
    item("Hard Page Break", "hardBreak", "Ctrl+Enter"),
    unavailable("Hard Shad"),
    unavailable("In-line Image..."),
    unavailable("Character Select..."),
  ],
  Format: [
    item("Font...", "font", "Ctrl+T"),
    unavailable("Font for Locked Kbd..."),
    unavailable("TCC Typeface..."),
    unavailable("Sambhota Keymaps..."),
    null,
    item("Line...", "line"),
    null,
    item("Left", "left"),
    item("Right", "right"),
    item("Centered", "center"),
    item("Full Justify", "justify"),
    null,
    unavailable("Expose Format Codes"),
  ],
  Options: [
    item("Toolbar", "toolbar", "", () => !$("#toolbar").hidden),
    item("Show Page Margins", "marginsVisible", "", () => doc.marginsVisible),
    item("Show Base Lines", "baselines", "", () => doc.baselines),
    unavailable("Cursor Movement Scrolls to Page"),
    unavailable("Wrap to Window"),
    null,
    unavailable("Rinchen Pung Shad Conversion"),
    unavailable("Dzog Thik (end Mark) Controls..."),
    unavailable("Yi-go Controls..."),
  ],
  Pecha: [
    item("Pecha Mode", "pecha", "Ctrl+E", () => doc.pecha),
    item(
      "Display Hint Colors for Pecha Page Types",
      "hints",
      "",
      () => doc.hints,
    ),
    item("Display Compact Pecha View", "compact", "Ctrl+D", () => doc.compact),
    null,
    unavailable("Insert Pecha-page Image..."),
    null,
    unavailable("Load Layout Template..."),
    item("Layout Controls...", "layout", "Ctrl+L"),
    null,
    unavailable("Annotation Controls..."),
    item("Placement Controls...", "placement"),
  ],
  Help: [
    unavailable("Help in English..."),
    unavailable("Help in Tibetan..."),
    unavailable("Check for Updates..."),
    item("About ...", "about"),
    null,
    item("Open synthetic example (rebuild)", "example"),
  ],
};
function closeMenu() {
  menu?.remove();
  menu = null;
  $("#menubar")
    .querySelectorAll("button")
    .forEach((b) => b.setAttribute("aria-expanded", "false"));
}
function openMenu(name, button) {
  const was = button.getAttribute("aria-expanded") === "true";
  closeMenu();
  if (was) return;
  button.setAttribute("aria-expanded", "true");
  menu = document.createElement("div");
  menu.className = "menu";
  menu.setAttribute("role", "menu");
  for (const entry of menus[name]) {
    if (!entry) {
      menu.append(document.createElement("hr"));
      continue;
    }
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "menuitem");
    b.setAttribute("aria-label", entry.label);
    b.disabled = !entry.command;
    const check = document.createElement("span");
    check.className = "check";
    check.textContent = entry.check?.() ? "✓" : "";
    const label = document.createElement("span");
    label.textContent = entry.label;
    const shortcut = document.createElement("span");
    shortcut.className = "shortcut";
    shortcut.textContent = entry.shortcut;
    b.append(check, label, shortcut);
    b.onpointerdown = (e) => e.preventDefault();
    b.onclick = () => execute(entry.command);
    b.onmouseenter = () =>
      status(
        entry.command ? entry.label : "Not yet implemented in this rebuild.",
      );
    menu.append(b);
  }
  document.body.append(menu);
  const r = button.getBoundingClientRect();
  menu.style.left = Math.min(r.left, innerWidth - menu.offsetWidth - 5) + "px";
  menu.style.top = r.bottom + "px";
}
for (const name of [
  "File",
  "Edit",
  "Insert",
  "Format",
  "Options",
  "Pecha",
  "Normal Kbd",
  "Help",
]) {
  const b = document.createElement("button");
  b.textContent = name;
  b.type = "button";
  if (name === "Normal Kbd") {
    b.title = "Locked keyboard mode is not yet implemented";
    b.disabled = true;
  } else {
    b.setAttribute("aria-haspopup", "menu");
    b.setAttribute("aria-expanded", "false");
    b.onclick = () => openMenu(name, b);
  }
  $("#menubar").append(b);
}
const icons = {
  new: '<path fill="white" stroke="#333" d="M4 1h8l4 4v14H4z"/><path fill="none" stroke="#333" d="M12 1v5h4"/>',
  open: '<path fill="#ffda55" stroke="#704d00" d="M1 6h7l2 2h9l-3 10H1z"/><path fill="#ffe28a" stroke="#704d00" d="M2 3h6l2 3h7v3H2z"/>',
  save: '<path fill="#5555aa" stroke="#222" d="M2 1h15l2 2v16H2z"/><path fill="#ddd" stroke="#333" d="M5 1h10v7H5zM5 12h11v7H5z"/>',
  print:
    '<path fill="#ddd" stroke="#333" d="M1 7h18v9H1zM5 1h10v7H5z"/><path fill="white" stroke="#333" d="M5 12h10v7H5z"/>',
  goto: '<path fill="white" stroke="#333" d="M5 1h12v18H5z"/><path stroke="blue" stroke-width="2" fill="none" d="M0 10h12m-4-4 4 4-4 4"/>',
  compact:
    '<path fill="white" stroke="#333" d="M1 2h18v6H1zM1 12h18v6H1z"/><path stroke="blue" d="M3 5h14M3 15h14"/>',
};
for (const [command, title] of [
  ["new", "New document (Ctrl+N)"],
  ["open", "Open... (Ctrl+O)"],
  ["save", "Save with current name (Ctrl+S)"],
  ["print", "Print... (Ctrl+P)"],
  ["goto", "Go To Page... (Ctrl+G)"],
  ["compact", "Toggle Compact Pecha View (Ctrl+D)"],
]) {
  const b = document.createElement("button");
  b.title = title;
  b.setAttribute("aria-label", title);
  b.innerHTML = `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">${icons[command]}</svg>`;
  b.onpointerdown = (e) => e.preventDefault();
  b.onclick = () => execute(command);
  $("#toolbar").append(b);
}
$("#toolbar").insertAdjacentHTML(
  "beforeend",
  '<span class="separator"></span><span class="keyboard-label">Keyboard Font {</span><select id="font-family" aria-label="Font family"><option>Times New Roman</option><option>Arial</option><option>Courier New</option><option>Georgia</option><option>Jomolhari</option></select><input id="font-size" aria-label="Font size" type="number" min="4" max="144" value="12"><span>}</span>',
);
$("#font-family").onchange = (e) => {
  checkpoint();
  editor.format({ fontFamily: e.target.value });
};
$("#font-size").onchange = (e) => {
  const size = Number(e.target.value);
  if (size >= 4 && size <= 144) {
    checkpoint();
    editor.format({ fontSize: size + "pt" });
  }
};
$("#pages").addEventListener("beforeinput", () => checkpoint());
$("#open-file").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const text = await f.text();
    let next;
    if (f.name.endsWith(".txt")) {
      next = newDocument();
      next.name = f.name;
      next.html = text
        .split(/\r?\n/)
        .map((line) => {
          const p = document.createElement("p");
          p.textContent = line;
          return p.outerHTML;
        })
        .join("");
    } else next = loadDocument(JSON.parse(text));
    checkpoint();
    doc = next;
    editor.savedSelection = null;
    editor.render(doc);
    dirty = false;
    updateStatus();
    status("Opened " + f.name);
  } catch (err) {
    status(err.message);
  }
  e.target.value = "";
};
window.addEventListener("beforeprint", () => editor.print($("#print-pages")));
document.addEventListener("pointerdown", (e) => {
  if (!e.target.closest(".menu") && !e.target.closest("#menubar")) closeMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeMenu();
    return;
  }
  if (menu && ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
    e.preventDefault();
    const choices = [...menu.querySelectorAll("button:not(:disabled)")],
      i = choices.indexOf(document.activeElement);
    choices[
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? choices.length - 1
          : (i + (e.key === "ArrowDown" ? 1 : -1) + choices.length) %
            choices.length
    ]?.focus();
    return;
  }
  if ($("#dialog").open) return;
  const cmd = e.ctrlKey || e.metaKey;
  if (cmd && e.key.toLowerCase() === "z") {
    e.preventDefault();
    const from = e.shiftKey ? redo : undo,
      to = e.shiftKey ? undo : redo;
    if (from.length) {
      to.push(clone(doc));
      doc = from.pop();
      editor.render(doc);
      dirty = true;
      updateStatus();
    }
    return;
  }
  if (cmd && e.key === "Enter") {
    e.preventDefault();
    execute("hardBreak");
    return;
  }
  if (cmd && ["b", "i", "u"].includes(e.key.toLowerCase())) {
    e.preventDefault();
    checkpoint();
    editor.restore();
    document.execCommand(
      { b: "bold", i: "italic", u: "underline" }[e.key.toLowerCase()],
    );
    doc.html = editor.collect();
    dirty = true;
    updateStatus();
    return;
  }
  const keys = {
    n: "new",
    o: "open",
    s: "save",
    p: "print",
    t: "font",
    l: "layout",
    e: "pecha",
    d: "compact",
    g: "goto",
    a: "selectAll",
  };
  if (cmd && keys[e.key.toLowerCase()] && !e.altKey) {
    e.preventDefault();
    execute(keys[e.key.toLowerCase()]);
  }
  if (e.key === "Tab" && e.target.closest(".page-editor")) {
    e.preventDefault();
    execute("tab");
  }
});
editor.render(doc);
updateStatus();
status("Ready");

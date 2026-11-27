import assert from "node:assert/strict";
import { chromium } from "playwright";
import fs from "node:fs/promises";
const base = process.env.BASE_URL || "http://127.0.0.1:8766/rebuild/";
const output = new URL("../test-output/", import.meta.url);
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 820 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const menu = async (name, item) => {
  await page.getByRole("button", { name, exact: true }).click();
  await page
    .getByRole("menuitem")
    .filter({ has: page.getByText(item, { exact: true }) })
    .click();
};
try {
  await page.goto(base);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: new URL("01-new-document.png", output).pathname,
  });
  await menu("Help", "Open synthetic example (rebuild)");
  assert.equal(await page.locator(".page-editor").count(), 2);
  assert(
    await page
      .locator("#pages")
      .textContent()
      .then((t) => t.includes("following pecha page")),
  );
  await page.screenshot({
    path: new URL("02-direct-editor.png", output).pathname,
  });
  // Select across mixed runs, change only size through actual toolbar, preserve bold and Tibetan font.
  await menu("Edit", "Select All");
  await page
    .getByRole("spinbutton", { name: "Font size", exact: true })
    .fill("24");
  await page
    .getByRole("spinbutton", { name: "Font size", exact: true })
    .press("Tab");
  const formatting = await page.locator("#pages").evaluate((root) => {
    const bold = [...root.querySelectorAll("b")].find(
        (n) => n.textContent === "Bold text",
      ),
      tib = [...root.querySelectorAll("span")].find(
        (n) => n.textContent === "བོད་ཡིག་དཔེ་མཚོན།",
      );
    return {
      bold: !!bold,
      weight: getComputedStyle(bold.lastElementChild || bold).fontWeight,
      size: getComputedStyle(bold.lastElementChild || bold).fontSize,
      tib: getComputedStyle(tib).fontFamily,
    };
  });
  assert.equal(formatting.weight, "700");
  assert.equal(formatting.size, "32px");
  assert(formatting.tib.includes("Jomolhari"));
  // Direct caret input and automatic pagination without markup editor.
  await menu("File", "New");
  await page.getByRole("textbox", { name: "Page 1 text", exact: true }).click();
  await page.keyboard.type("Typed directly into the pecha.");
  assert(
    (await page.locator("#pages").textContent()).includes(
      "Typed directly into the pecha.",
    ),
  );
  await page.keyboard.press("Enter");
  await page.keyboard.insertText(
    "A paragraph that flows across pages. ".repeat(110),
  );
  assert((await page.locator(".page-editor").count()) > 2);
  const before = await page.locator(".page-editor").allTextContents();
  assert.equal(
    before
      .join("")
      .replaceAll("\u200b", "")
      .match(/A paragraph that flows across pages\./g).length,
    110,
  );
  // Change body layout and verify geometry and reflow.
  await menu("Pecha", "Layout Controls...");
  await page.getByRole("tab", { name: "Body", exact: true }).click();
  await page
    .getByRole("spinbutton", {
      name: "Lines of Text on Body Pages",
      exact: true,
    })
    .fill("4");
  await page.getByLabel("Single", { exact: true }).check();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  assert.equal(await page.locator(".frame-inner").count(), 0);
  await page.screenshot({
    path: new URL("03-layout-body.png", output).pathname,
  });
  await page.getByRole("button", { name: "OK", exact: true }).click();
  assert.equal(
    (await page.locator(".page-editor").allTextContents())
      .join("")
      .match(/A paragraph that flows across pages\./g).length,
    110,
  );
  // Save/reopen exact rich content and settings through real file controls.
  const downloading = page.waitForEvent("download");
  await menu("File", "Save");
  const download = await downloading;
  const saved = await fs.readFile(await download.path());
  const data = JSON.parse(saved);
  assert.equal(data.types.body.lines, 4);
  assert.equal(data.types.body.style, "single");
  await menu("File", "New");
  await page
    .locator("#open-file")
    .setInputFiles({
      name: "roundtrip.pecha-web",
      mimeType: "application/json",
      buffer: saved,
    });
  await page.waitForFunction(() =>
    document.querySelector("#status").textContent.startsWith("Opened"),
  );
  assert.equal(
    (await page.locator(".page-editor").allTextContents())
      .join("")
      .match(/A paragraph that flows across pages\./g).length,
    110,
  );
  // A cancelled dialog does not change the live layout.
  await menu("Pecha", "Layout Controls...");
  await page.getByRole("tab", { name: "Body", exact: true }).click();
  await page
    .getByRole("spinbutton", {
      name: "Lines of Text on Body Pages",
      exact: true,
    })
    .fill("9");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const d2 = page.waitForEvent("download");
  await menu("File", "Save");
  assert.equal(
    JSON.parse(await fs.readFile(await (await d2).path())).types.body.lines,
    4,
  );
  // Smaller reviewable fixture, original-style font dialog, hint colors omitted in print.
  await menu("Help", "Open synthetic example (rebuild)");
  await menu("Edit", "Select All");
  await menu("Format", "Font...");
  await page.screenshot({
    path: new URL("04-font-dialog.png", output).pathname,
  });
  await page.locator('select[name="fontSize"]').selectOption("18pt");
  await page.getByRole("button", { name: "OK", exact: true }).click();
  assert.equal(
    await page
      .locator("#pages b span")
      .first()
      .evaluate((n) => getComputedStyle(n).fontSize),
    "24px",
  );
  await menu("Pecha", "Display Compact Pecha View");
  await page.screenshot({
    path: new URL("05-compact-pages.png", output).pathname,
  });
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  assert.equal(
    await page.locator("#print-pages .page-editor").count(),
    await page.locator("#pages .page-editor").count(),
  );
  assert.equal(
    await page
      .locator("#print-pages .pecha-frame")
      .first()
      .evaluate((n) => getComputedStyle(n).color),
    "rgb(0, 0, 0)",
  );
  await page.pdf({
    path: new URL("output.pdf", output).pathname,
    preferCSSPageSize: true,
    printBackground: true,
  });

  // Original six-tab layout: title/fancy/body transitions and independent numbering.
  await menu("Pecha", "Layout Controls...");
  await page.getByRole("tab", { name: "Style", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Title page count", exact: true })
    .fill("1");
  await page
    .getByRole("spinbutton", { name: "Fancy page count", exact: true })
    .fill("2");
  await page.getByRole("tab", { name: "Title", exact: true }).click();
  await page
    .getByRole("spinbutton", {
      name: "Lines of Text on Title Pages",
      exact: true,
    })
    .fill("1");
  await page.getByRole("tab", { name: "Fancy", exact: true }).click();
  await page
    .getByRole("spinbutton", {
      name: "Lines of Text on Fancy Pages",
      exact: true,
    })
    .fill("1");
  await page.getByRole("tab", { name: "Page Numbers", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Beginning Number", exact: true })
    .fill("101");
  await page.getByRole("button", { name: "OK", exact: true }).click();
  assert.deepEqual(
    await page
      .locator("#pages>.paper")
      .evaluateAll((ns) => ns.slice(0, 4).map((n) => n.dataset.type)),
    ["title", "fancy", "fancy", "body"],
  );
  assert.equal(
    await page.locator("#pages .page-number").first().textContent(),
    "102",
  );
  await menu("Pecha", "Layout Controls...");
  await page.getByRole("tab", { name: "Body", exact: true }).click();
  await page.screenshot({
    path: new URL("07-layout-reference.png", output).pathname,
  });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.locator("#workspace").evaluate((e) => (e.scrollTop = 0));
  await menu("Options", "Show Page Margins");
  await page.getByRole("button", { name: "Pecha", exact: true }).click();
  await page.screenshot({
    path: new URL("08-pecha-menu.png", output).pathname,
  });
  await page.keyboard.press("Escape");
  // Two pecha pages on each printed sheet, with centered placement.
  await menu("Pecha", "Placement Controls...");
  await page
    .getByRole("spinbutton", { name: "Pecha Pages per Sheet", exact: true })
    .fill("2");
  await page
    .getByLabel("Centered between the Top and Bottom Margins", { exact: true })
    .check();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  assert.equal(
    await page.locator("#print-pages>.print-sheet").count(),
    Math.ceil((await page.locator("#pages>.paper").count()) / 2),
  );
  await page.pdf({
    path: new URL("two-up.pdf", output).pathname,
    preferCSSPageSize: true,
    printBackground: true,
  });
  // Pecha mode toggles the same rich text into ordinary page editing, then back.
  const plain = (
    await page.locator("#pages .page-editor").allTextContents()
  ).join("");
  await menu("Pecha", "Pecha Mode");
  assert.equal(await page.locator("#pages .pecha-frame").count(), 0);
  assert.equal(
    (await page.locator("#pages .page-editor").allTextContents()).join(""),
    plain,
  );
  await menu("Pecha", "Pecha Mode");
  assert.equal(
    (await page.locator("#pages .page-editor").allTextContents()).join(""),
    plain,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: direct editing, pagination, mixed-run size changes, layout apply/cancel, save/open, font dialog, compact view and PDF.",
  );
} finally {
  await browser.close();
}

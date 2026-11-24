// Run with Playwright installed and a local docs server: node test/typeover.browser.cjs [URL]
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
(async () => {
  const browser = await chromium.launch({channel:'chrome', headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[]; page.on('pageerror', e=>errors.push(e.message));
    await page.goto((process.argv[2] || 'http://127.0.0.1:8767/') + '?sample');
    const editor=page.locator('#text'); await editor.waitFor({state:'visible'});
    const reset = async (text, start, end=start) => {
      await editor.fill(text);
      await editor.evaluate((el, range)=>{el.focus();el.setSelectionRange(...range);},[start,end]);
    };
    await reset('ABC',1);
    await page.keyboard.press('Insert');
    assert(await page.locator('#typeover').isChecked());
    await page.keyboard.type('x'); assert.equal(await editor.inputValue(),'AxC');
    await page.keyboard.press('Meta+z'); assert.equal(await editor.inputValue(),'ABC');
    await page.keyboard.press('Meta+Shift+z'); assert.equal(await editor.inputValue(),'AxC');
    await reset('ABC',3); await page.keyboard.type('xy'); assert.equal(await editor.inputValue(),'ABCxy');
    await reset('ABCDE',1,4); await page.keyboard.type('x'); assert.equal(await editor.inputValue(),'AxE');
    await reset('ཀྱི་ཁ',0); await page.keyboard.insertText('ག'); assert.equal(await editor.inputValue(),'ག་ཁ');
    await reset('ཀཁ',1); await page.keyboard.insertText('ི'); assert.equal(await editor.inputValue(),'ཀིཁ');
    await reset('😀B',0); await page.keyboard.type('x'); assert.equal(await editor.inputValue(),'xB');
    await reset('A{b}B',0); await page.keyboard.type('xy'); assert.equal(await editor.inputValue(),'xy{b}B');
    await reset('A\nB',0); await page.keyboard.type('xy'); assert.equal(await editor.inputValue(),'xy\nB');
    // Input event filtering: composition and paste must not expand a collapsed selection.
    for(const inputType of ['insertCompositionText','insertFromPaste','insertReplacementText']) {
      await reset('ABC',1);
      const selection=await editor.evaluate((el,type)=>{
        el.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:type,data:'x',isComposing:type==='insertCompositionText'}));
        return [el.selectionStart,el.selectionEnd];
      },inputType);
      assert.deepEqual(selection,[1,1]);
    }
    await reset('ABC',1);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition',{text:'ཀ',selectionStart:1,selectionEnd:1});
    await cdp.send('Input.insertText',{text:'ཀི'});
    assert.equal(await editor.inputValue(),'AཀིBC', 'committed IME text inserts without overwriting');
    await cdp.detach();
    await page.keyboard.press('Insert'); assert(!(await page.locator('#typeover').isChecked()));
    await reset('ABC',1); await page.keyboard.type('x'); assert.equal(await editor.inputValue(),'AxBC');
    await reset('ཀྱི་ཁ་ གུ་\n{b}Bold{/b} plain',0);
    await page.locator('#typeover').check(); await editor.focus(); await page.keyboard.insertText('ག');
    await page.waitForTimeout(600);
    console.log('Preview SVGs:',await page.locator('#table svg').count());
    assert(await page.locator('#table svg').count()>0);
    if (process.env.QA_SCREENSHOT) await page.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#saveDoc').click();
    const download = await downloadPromise;
    const saved = JSON.parse(require('node:fs').readFileSync(await download.path(), 'utf8'));
    assert.equal(saved.text, await editor.inputValue(), 'full Save retains the typeover edit');
    assert(await page.locator('#typeover').isChecked(), 'Save does not reset the editing mode');
    const upload = async (name, content) => {
      await page.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer:Buffer.from(content)});
      await page.waitForFunction(name => document.getElementById('toast').textContent.startsWith(`Opened ${name}.`), name);
    };
    // Applying settings keeps the current editing session, including Typeover.
    for (const kind of ['template','annotations']) {
      await upload(`${kind}.pecha`, JSON.stringify({format:'web-pecha-part',version:1,kind,settings:{}}));
      assert(await page.locator('#typeover').isChecked(), `${kind} preserves typing mode`);
      assert.equal(await editor.inputValue(),saved.text);
    }
    await upload('native-layout.pxt','; PechaMaker Template file.\n[File Version 0.5]\n[PageSetup]\nPaperSize.x=14000\nPaperSize.y=8500\n[PechaControl]\nPechaHeight=3\n');
    assert(await page.locator('#typeover').isChecked(), 'native layout preserves typing mode');
    assert.equal(await editor.inputValue(),saved.text);
    await upload('full.pecha',JSON.stringify(saved));
    assert(!(await page.locator('#typeover').isChecked()), 'full Open returns to Insert');
    await page.locator('#typeover').check();
    await upload('content.pecha',JSON.stringify({format:'web-pecha-part',version:1,kind:'content',settings:{text:'Replacement body'}}));
    assert(!(await page.locator('#typeover').isChecked()), 'body replacement returns to Insert');
    assert.equal(await editor.inputValue(),'Replacement body');
    await page.locator('#typeover').check();
    await page.locator('#newDoc').click(); await page.locator('#pasteText').click();
    assert(!(await page.locator('#typeover').isChecked()), 'New returns to Insert');
    await reset('ABC',1); await page.keyboard.type('x'); assert.equal(await editor.inputValue(),'AxBC');
    await page.locator('#typeover').check();
    await page.getByText('Reuse text, layouts and annotations',{exact:true}).click();
    page.once('dialog',dialog=>dialog.dismiss()); await page.locator('#closeDoc').click();
    assert(await page.locator('#typeover').isChecked(), 'cancelled Close preserves Typeover');
    page.once('dialog',dialog=>dialog.accept()); await page.locator('#closeDoc').click();
    assert(!(await page.locator('#typeover').isChecked()), 'confirmed Close returns to Insert');
    await page.locator('#resume').click();
    assert(!(await page.locator('#typeover').isChecked()), 'recovery resumes in Insert mode');
    assert.equal(await editor.inputValue(),'AxBC');
    assert.deepEqual(errors,[]);
    console.log('PASS: real Chromium typing, toggle, EOF, selection, Tibetan/emoji clusters, token/line boundaries, native undo/redo, IME commit, paste event filtering, preview, Save, New/Open/Close/recovery reset, partial-settings retention, no page errors');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

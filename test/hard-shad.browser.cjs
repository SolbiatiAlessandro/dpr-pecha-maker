// With Playwright and a docs server: node test/hard-shad.browser.cjs [URL]
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const fixture=require('./hard-shad-fixture');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.argv[2]||'http://127.0.0.1:8769/');
    await page.locator('#pasteText').click();
    const upload=(name,buffer)=>page.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});
    await upload('fixed-shad.pxp',fixture.native());
    const expected='{30}{hs}\nཀ{hs} {hs}\nཀ། །{page}ཀ{hs}';
    await page.waitForFunction(text=>document.querySelector('#text').value===text,expected);
    await page.waitForFunction(()=>document.querySelectorAll('#table svg').length>0);
    const visible=await page.locator('#table').textContent();
    assert(visible.includes('།'));assert(!visible.includes('\u000b'));assert(!visible.includes('\ue00d'));
    await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
    const printed=await page.locator('#printRoot').textContent();
    assert(printed.includes('།'));assert(!printed.includes('\ue00d'));
    const download=page.waitForEvent('download');await page.locator('#saveDoc').click();
    const saved=fs.readFileSync(await (await download).path());
    const doc=JSON.parse(saved);assert.equal(doc.text,expected);
    assert.equal(doc.notes.sets['title.front'].inL.text,'{font:jomolhari}ཀ{hs}');
    await upload('fixed-shad.pecha',saved);
    await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Opened fixed-shad.pecha.');
    assert.equal(await page.locator('#text').inputValue(),expected);
    if(process.env.QA_SCREENSHOT)await page.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
    assert.deepEqual(errors,[]);console.log('PASS: native import, visible shads, print SVG, body/annotation Save/Open, no JS errors');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

// With Playwright and a docs server: node test/images-dpi.browser.cjs [URL]
const assert=require('node:assert/strict'), fs=require('node:fs');
const {chromium}=require('playwright'), fixture=require('./image-dpi-fixture');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];
    page.setDefaultTimeout(15000);
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.argv[2]||'http://127.0.0.1:8768/');
    await page.locator('#pasteText').click();
    const upload=async(name,buffer)=>page.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});
    await upload('asymmetric.pxp',fixture.native());
    await page.waitForFunction(()=>document.querySelectorAll('#imagePick option').length===3);
    await page.locator('#text').fill('ཀ་ {image:native-inline-0} after{page}ཁ་');
    await page.waitForFunction(()=>document.querySelectorAll('#table image').length===3);
    const sizes=()=>page.locator('#table image').evaluateAll(images=>images.map(image=>({
      id:image.dataset.imageId,w:+image.getAttribute('width'),h:+image.getAttribute('height'),aspect:image.getAttribute('preserveAspectRatio')})));
    for(const image of await sizes()) {assert.equal(image.w,72);assert.equal(image.h,72);assert.equal(image.aspect,'none');}
    await upload('missing-dpi.pxp',fixture.native(96,0));
    await page.waitForFunction(()=>document.getElementById('importMessages').textContent.includes('both axes'));
    await page.locator('#text').fill('ཀ་ {image:native-inline-0} after{page}ཁ་');
    await page.waitForFunction(()=>[...document.querySelectorAll('#table image')].every(im=>+im.getAttribute('height')===36));
    assert((await page.locator('#importMessages').innerText()).includes('both axes'));
    // A fresh document verifies actual PNG metadata ingestion through the file picker.
    await page.goto(process.argv[2]||'http://127.0.0.1:8768/'); await page.locator('#pasteText').click();
    await page.getByText('Images',{exact:true}).click();
    await page.locator('#imageFile').setInputFiles({name:'generated.png',mimeType:'image/png',buffer:fixture.png()});
    await page.waitForFunction(()=>document.querySelectorAll('#imagePick option').length===1);
    assert(Math.abs(Number(await page.locator('#f_images_0_dpi').inputValue())-96)<.02);
    assert(Math.abs(Number(await page.locator('#f_images_0_dpiY').inputValue())-48)<.02);
    const pngDownload=page.waitForEvent('download'); await page.locator('#exportImage').click();
    assert.deepEqual(fs.readFileSync(await (await pngDownload).path()),fixture.png(),'PNG download preserves source density metadata');
    const geometry=async(w,h)=>page.waitForFunction(({w,h})=>{
      const im=document.querySelector('#table image');return im&&Math.abs(+im.getAttribute('width')-w)<.02&&Math.abs(+im.getAttribute('height')-h)<.02;
    },{w,h});
    await geometry(72,72);
    await page.locator('#f_images_0_dpi').fill('96');
    await page.locator('#f_images_0_dpiY').fill('96'); await geometry(72,36);
    await page.locator('#f_images_0_dpiY').fill('48'); await geometry(72,72);
    await page.locator('#f_images_0_ignoreDpi').check(); await geometry(72,36);
    await page.locator('#f_images_0_ignoreDpi').uncheck(); await geometry(72,72);
    await page.locator('#f_images_0_dpiY').fill(''); await geometry(72,36);
    await page.locator('#f_images_0_dpiY').fill('48');
    await page.locator('#f_images_0_scale').fill('50'); await geometry(36,36);
    await page.locator('#text').evaluate(el=>{el.focus();el.setSelectionRange(0,0);});
    await page.locator('#copyImage').click();
    await page.waitForFunction(()=>document.querySelectorAll('#table image').length===2);
    assert.deepEqual((await sizes()).map(i=>[i.w,i.h]),[[72,72],[36,36]]);
    await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
    const print=await page.locator('#printRoot image').evaluateAll(images=>images.map(im=>[+im.getAttribute('width'),+im.getAttribute('height'),im.getAttribute('preserveAspectRatio')]));
    assert.deepEqual(print,[[72,72,'none'],[36,36,'none']]);
    const downloadPromise=page.waitForEvent('download'); await page.locator('#saveDoc').click();
    const downloaded=await downloadPromise, saved=fs.readFileSync(await downloaded.path());
    assert(JSON.parse(saved).images.every(p=>p.dpi===96&&p.dpiY===48));
    await upload('saved.pecha',saved);
    await page.waitForFunction(()=>document.getElementById('toast').textContent==='Opened saved.pecha.');
    assert.deepEqual((await sizes()).map(i=>[i.w,i.h]),[[72,72],[36,36]]);
    if(process.env.QA_SCREENSHOT) await page.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS: native inline/page/yi-go, missing-axis warning, PNG file import, axis controls, Ignore DPI, scale/copy, print SVG, full Save/Open, no page errors');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

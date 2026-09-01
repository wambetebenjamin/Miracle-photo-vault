/* Functional suite for Miracle. Run: node test.js */
const { makeDom, downloads, readBlob, readText } = require('./harness.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  ->  ' + JSON.stringify(extra) : '')); }
};
const wait = ms => new Promise(r => setTimeout(r, ms));

const dom = makeDom();
const w = dom.window, d = w.document;
const M = () => w.Miracle;
const imgFile = (name) => new w.File(['W1200H800'], name || 'photo.jpg', { type: 'image/jpeg' });
function setVal(sel, v) { const n = d.querySelector(sel); n.value = v; n.dispatchEvent(new w.Event('input', { bubbles: true })); return n; }

(async () => {
  await wait(400);

  console.log('\n== boot ==');
  ok('Miracle API exposed', !!M());
  ok('default categories seeded', M().state.categories.length >= 4, M().state.categories.length);
  ok('falls back to localStorage (no IDB)', M().backend === 'localStorage', M().backend);
  ok('no published archive by default', M().publishedMode === false);
  ok('no emoji in markup', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(d.documentElement.innerHTML));

  console.log('\n== ingest ==');
  M().go('composer'); await wait(80);
  await M().ingest([imgFile('a.jpg')], 'device'); await wait(350);
  ok('single file ingested', M().draft.photos.length === 1, M().draft.photos.length);
  const p0 = M().draft.photos[0];
  ok('photo keeps dimensions', p0.w === 1200 && p0.h === 800, [p0.w, p0.h]);
  await M().ingest([imgFile('b.jpg'), imgFile('c.jpg')], 'device'); await wait(450);
  ok('multi-file ingest appends', M().draft.photos.length === 3, M().draft.photos.length);

  console.log('\n== save + persist ==');
  setVal('#inTitle', 'Kericho sunrise');
  setVal('#inCap', 'Morning light over the tea fields.');
  const cs = setVal('#inCat', M().state.categories[0].id);
  await M().saveDraft(); await wait(250);
  ok('bundle created', M().state.bundles.length === 1, M().state.bundles.length);
  const b0 = M().state.bundles[0];
  ok('bundle has 3 photos', b0.photos.length === 3, b0.photos.length);
  await M().persist(); await wait(120);
  ok('written to localStorage', (w.localStorage.getItem('miracle.v1') || '').includes('Kericho sunrise'));

  console.log('\n== export / import round trip ==');
  downloads.length = 0;
  M().exportLibrary(); await wait(200);
  const exp = downloads.find(x => /\.json$/.test(x.name || ''));
  ok('export downloads json', !!exp, downloads.map(x => x.name));
  const json = await readText(w, exp.blob);
  const beforeSrcs = b0.photos.map(p => p.src);
  M().state.bundles = []; await M().persist(); await wait(120);
  ok('archive emptied', M().state.bundles.length === 0);
  await M().importLibrary(new w.File([json], 'backup.json', { type: 'application/json' })); await wait(400);
  const back = M().state.bundles[0];
  ok('bundle restored', !!back && back.title === 'Kericho sunrise', back && back.title);
  ok('photos restored byte-identical', back && JSON.stringify(back.photos.map(p => p.src)) === JSON.stringify(beforeSrcs));

  console.log('\n== ingest lock releases ==');
  M().resetDraft(false); await wait(80);
  M().go('composer'); await wait(80);
  await M().ingest([imgFile('p1.jpg')], 'clipboard'); await wait(350);
  await M().ingest([imgFile('p2.jpg'), imgFile('p3.jpg')], 'clipboard'); await wait(450);
  ok('second paste still accepted (lock not stuck)', M().draft.photos.length === 3, M().draft.photos.length);
  ok('dropzone not left busy', !d.querySelector('#dropzone').classList.contains('busy'));

  console.log('\n== folder scan + batch picker ==');
  M().resetDraft(false); await wait(80);
  const mkFile = (name, type) => ({ kind: 'file', getFile: async () => new w.File(['W1200H800'], name, { type }) });
  const mkDir = (name, kids) => ({ kind: 'directory', name, entries: async function* () { for (const k of kids) yield k; } });
  w.showDirectoryPicker = async () => ({
    name: 'WhatsApp images', kind: 'directory',
    entries: async function* () {
      yield ['IMG_1.jpg', mkFile('IMG_1.jpg', 'image/jpeg')];
      yield ['notes.txt', mkFile('notes.txt', 'text/plain')];
      yield ['Camera', mkDir('Camera', [['IMG_2.png', mkFile('IMG_2.png', 'image/png')], ['IMG_3.webp', mkFile('IMG_3.webp', 'image/webp')]])];
    }
  });
  await M().pickFolder(); await wait(150);
  const tiles = d.querySelectorAll('.lb .btile');
  ok('scanned recursively, non-images filtered', tiles.length === 3, tiles.length);
  const names = Array.from(tiles).map(t => t.querySelector('.nm').textContent).sort();
  ok('all three images detected', JSON.stringify(names) === JSON.stringify(['IMG_1.jpg', 'IMG_2.png', 'IMG_3.webp']), names);
  d.querySelectorAll('.btile')[2].click(); await wait(30);
  ok('deselecting updates count', /Import 2 photos/.test(d.querySelector('.batch footer .btn.primary').textContent));
  d.querySelector('.batch footer .btn.primary').click(); await wait(500);
  ok('only the chosen batch reached the composer', M().draft.photos.length === 2, M().draft.photos.length);
  delete w.showDirectoryPicker;

  console.log('\n== publish to my site ==');
  M().resetDraft(false); await wait(80);
  downloads.length = 0;
  await M().publishArchive(); await wait(500);
  const pub = downloads.find(x => x.name === 'public-archive.js');
  ok('publish downloads public-archive.js', !!pub, downloads.map(x => x.name));
  const js = await readText(w, pub.blob);
  ok('file assigns the global', js.startsWith('window.MIRACLE_PUBLISHED = '), js.slice(0, 40));
  const payload = JSON.parse(js.replace(/^window\.MIRACLE_PUBLISHED = /, '').replace(/;\s*$/, ''));
  ok('payload declares itself', payload.app === 'miracle-published', payload.app);
  ok('payload has the bundle', payload.bundles.length === 1 && payload.bundles[0].photos.length === 3);
  ok('photos embedded as data urls', payload.bundles[0].photos.every(p => /^data:image\/jpeg;base64,/.test(p.src)));
  ok('categories included so labels survive', Array.isArray(payload.categories) && payload.categories.length >= 4);
  ok('no raw < in payload (script-safe)', !js.includes('</script'));

  console.log('\n== per-category download ==');
  downloads.length = 0;
  M().downloadCategory(M().state.categories[0].id); await wait(300);
  const zip = downloads.find(x => /\.zip$/.test(x.name || ''));
  ok('category zip produced', !!zip, downloads.map(x => x.name));
  if (zip) {
    const buf = await readBlob(w, zip.blob);
    require('fs').writeFileSync(__dirname + '/category.zip', buf);
    ok('zip has PK signature', buf[0] === 0x50 && buf[1] === 0x4b);
  }

  console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');

  /* ---- second document: a visitor arriving at the deployed link ---- */
  console.log('\n== visitor with public-archive.js ==');
  let vpass = 0, vfail = 0;
  const vok = (n, c, x) => { if (c) { vpass++; console.log('  PASS  ' + n); } else { vfail++; console.log('  FAIL  ' + n + (x !== undefined ? '  ->  ' + JSON.stringify(x) : '')); } };
  const vdom = makeDom({ preload: win => { win.MIRACLE_PUBLISHED = payload; } });
  const vw = vdom.window;
  const VM = () => vw.Miracle;
  await wait(500);
  vok('published mode active', VM().publishedMode === true);
  vok('bundles seeded from the file', VM().state.bundles.length === 1, VM().state.bundles.length);
  vok('photos visible to the visitor', VM().state.bundles[0].photos.length === 3, VM().state.bundles[0].photos.length);
  vok('titles come through', VM().state.bundles[0].title === 'Kericho sunrise', VM().state.bundles[0].title);
  vok('categories come through', VM().state.categories.some(c => c.id === VM().state.bundles[0].categoryId));
  vok('visitor storage left untouched', !vw.localStorage.getItem('miracle.v1'));
  await VM().persist(); await wait(120);
  vok('persist is a no-op for visitors', !vw.localStorage.getItem('miracle.v1'));

  console.log('\n== owner keeps their own archive ==');
  const odom = makeDom({
    seed: { 'miracle.v1': JSON.stringify({
      bundles: [{ id: 'b_1', title: 'Mine', caption: '', categoryId: payload.categories[0].id, coverId: 'p1', createdAt: new Date().toISOString(),
        photos: [{ id: 'p1', src: 'data:image/jpeg;base64,QUJD', name: 'mine.jpg', caption: '', alt: '', w: 10, h: 10, bytes: 3 }] }],
      categories: payload.categories, settings: {}
    }) },
    preload: win => { win.MIRACLE_PUBLISHED = payload; }
  });
  await wait(400);
  const OM = () => odom.window.Miracle;
  ok('owner not forced into published mode', OM().publishedMode === false, OM().publishedMode);
  ok('owner still sees their own bundle', OM().state.bundles.length === 1 && OM().state.bundles[0].title === 'Mine', OM().state.bundles.map(b => b.title));

  console.log('\nRESULT: ' + (pass + vpass) + ' passed, ' + (fail + vfail) + ' failed');
  process.exit((fail + vfail) ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });

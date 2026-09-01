/* ZIP bundle import. Run: node test-zip.js
   Zips are built with the app's own writer (stored entries), so the reader
   is exercised against genuine zip bytes rather than a fixture. */
const { makeDom, downloads, readBlob } = require('./harness.js');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '  ->  ' + JSON.stringify(x) : '')); } };
const wait = ms => new Promise(r => setTimeout(r, ms));

const dom = makeDom();
const w = dom.window, d = w.document;
const M = () => w.Miracle;

async function makeZip(name, entries) {
  const blob = M().buildZip(entries.map(e => ({ name: e[0], data: new TextEncoder().encode(e[1]) })));
  const bytes = await readBlob(w, blob);
  return new w.File([bytes], name, { type: 'application/zip' });
}

(async () => {
  await wait(400);

  console.log('\n== filename -> bundle title ==');
  ok('plain name capitalised', M().titleFromFilename('wedding.zip') === 'Wedding', M().titleFromFilename('wedding.zip'));
  ok('underscores and dashes become spaces', M().titleFromFilename('Kericho_Trip-2024.zip') === 'Kericho Trip 2024', M().titleFromFilename('Kericho_Trip-2024.zip'));
  ok('repeated separators collapse', M().titleFromFilename('a___b--c.zip') === 'A b c', M().titleFromFilename('a___b--c.zip'));
  ok('empty name falls back', M().titleFromFilename('.zip') === 'Untitled bundle');
  ok('already-capitalised names untouched', M().titleFromFilename('Nyahururu Falls.zip') === 'Nyahururu Falls');

  console.log('\n== zip reader ==');
  const zip = await makeZip('Kericho Trip.zip', [['a.jpg', 'AAA'], ['b.jpg', 'BBB'], ['notes.txt', 'ignore me']]);
  const entries = await M().readZip(zip);
  ok('reads every entry', entries.length === 3, entries.length);
  ok('entry names intact', JSON.stringify(entries.map(e => e.name)) === JSON.stringify(['a.jpg', 'b.jpg', 'notes.txt']), entries.map(e => e.name));
  ok('entry bytes intact', new TextDecoder().decode(entries[0].data) === 'AAA');
  let threw = null;
  try { await M().readZip(new w.File(['not a zip at all'], 'fake.zip', { type: 'application/zip' })); } catch (e) { threw = e; }
  ok('rejects a file that is not a zip', !!threw && /not a readable zip/i.test(threw.message), threw && threw.message);

  console.log('\n== import as a bundle ==');
  const before = M().state.bundles.length;
  const made = await M().importZipFiles([zip]);
  await wait(300);
  ok('one bundle created', made === 1, made);
  ok('added to the archive', M().state.bundles.length === before + 1, M().state.bundles.length);
  const b = M().state.bundles[0];
  ok('title taken from the filename', b.title === 'Kericho Trip', b.title);
  ok('only images imported, text skipped', b.photos.length === 2, b.photos.length);
  ok('photos are real data urls', b.photos.every(p => /^data:image\/jpeg;base64,/.test(p.src)));
  ok('photo names kept from the zip', JSON.stringify(b.photos.map(p => p.name)) === JSON.stringify(['a.jpg', 'b.jpg']), b.photos.map(p => p.name));
  ok('cover assigned', b.coverId === b.photos[0].id);
  ok('bundle id follows the app convention', /^b_\d+$/.test(b.id), b.id);
  ok('persisted', (w.localStorage.getItem('miracle.v1') || '').includes('Kericho Trip'));

  console.log('\n== several zips at once ==');
  const z2 = await makeZip('wedding.zip', [['1.jpg', 'X']]);
  const z3 = await makeZip('Nyahururu_Falls.zip', [['2.jpg', 'Y'], ['3.jpg', 'Z']]);
  await M().importZipFiles([z2, z3]); await wait(300);
  const titles = M().state.bundles.map(x => x.title).slice(0, 2).sort();
  ok('each zip became its own bundle', JSON.stringify(titles) === JSON.stringify(['Nyahururu Falls', 'Wedding']), titles);
  ok('photo counts per bundle correct', M().state.bundles.find(x => x.title === 'Nyahururu Falls').photos.length === 2);

  console.log('\n== graceful failures ==');
  const empty = await makeZip('empty.zip', []);
  const n0 = M().state.bundles.length;
  await M().importZipFiles([empty]); await wait(200);
  ok('empty zip adds nothing', M().state.bundles.length === n0);
  const notZip = new w.File(['hello'], 'broken.zip', { type: 'application/zip' });
  await M().importZipFiles([notZip]); await wait(200);
  ok('broken zip does not crash or add', M().state.bundles.length === n0);

  console.log('\n== the bundle is visible in the UI ==');
  M().go('gallery'); await wait(250);
  const html = d.querySelector('#page-gallery').innerHTML;
  ok('gallery shows the zip-derived title', html.includes('Kericho Trip'));
  ok('gallery shows the other zip too', html.includes('Wedding'));

  console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });

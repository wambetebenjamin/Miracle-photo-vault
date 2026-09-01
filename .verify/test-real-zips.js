/* Runs the app's zip reader against the real archives committed to the repo.
   Expected counts come from Python's zipfile, independently. */
const fs = require('fs');
const path = require('path');
const { makeDom } = require('./harness.js');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '  ->  ' + JSON.stringify(x) : '')); } };
const wait = ms => new Promise(r => setTimeout(r, ms));

const REAL = path.join(__dirname, 'real');
/* name -> entry count, from Python zipfile */
const EXPECTED = { 'Amani flats 1500.zip': 6, 'KPK 3500.zip': 7, 'Sigi 1300.zip': 2, 'Nyagacho blocks ABC.zip': 0 };

const dom = makeDom();
const w = dom.window;
const M = () => w.Miracle;

(async () => {
  await wait(400);

  console.log('\n== reader vs real archives ==');
  for (const [name, count] of Object.entries(EXPECTED)) {
    const bytes = fs.readFileSync(path.join(REAL, name));
    const entries = await M().readZip(new w.Blob([bytes], { type: 'application/zip' }));
    ok(name + ' -> ' + count + ' entries', entries.length === count, entries.length);
  }

  const amani = await M().readZip(new w.Blob([fs.readFileSync(path.join(REAL, 'Amani flats 1500.zip'))]));
  ok('entry names keep .jpeg', amani.every(e => /\.jpeg$/i.test(e.name)), amani.map(e => e.name).slice(0, 2));
  ok('entry names look like WhatsApp exports', /^WhatsApp Image \d{4}-\d{2}-\d{2}/.test(amani[0].name), amani[0].name);
  ok('unpacked sizes are plausible JPEGs', amani.every(e => e.data.length > 20000), amani.map(e => e.data.length));
  ok('JPEG magic bytes present', amani.every(e => e.data[0] === 0xff && e.data[1] === 0xd8), amani[0] && [amani[0].data[0], amani[0].data[1]]);

  console.log('\n== intact JPEGs pass through without re-encoding ==');
  const rawZip = new w.File([fs.readFileSync(path.join(REAL, 'Amani flats 1500.zip'))], 'Amani flats 1500.zip', { type: 'application/zip' });
  await M().importZipFiles([rawZip]); await wait(500);
  const imported = M().state.bundles[0];
  ok('bundle created from the real zip', imported.title === 'Amani flats 1500', imported.title);
  ok('all 6 photos imported', imported.photos.length === 6, imported.photos.length);
  const decoded = Buffer.from(imported.photos[0].src.split(',')[1], 'base64');
  ok('photo bytes identical to the original file', decoded.equals(amani[0].data), [decoded.length, amani[0].data.length]);
  ok('byte count recorded accurately', imported.photos[0].bytes === amani[0].data.length, [imported.photos[0].bytes, amani[0].data.length]);

  console.log('\n== every archive in the repo ==');
  const files = fs.readdirSync(REAL).filter(f => /\.zip$/i.test(f) && !/^(amani|kpk|nyagacho)\.zip$/.test(f));
  ok('all 21 repo archives present', files.length === 21, files.length);
  let photos = 0, withPhotos = 0, empties = [];
  for (const f of files) {
    const es = await M().readZip(new w.Blob([fs.readFileSync(path.join(REAL, f))], { type: 'application/zip' }));
    const imgs = es.filter(e => /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|tif?f?)$/i.test(e.name.split('/').pop()));
    photos += imgs.length;
    if (imgs.length) withPhotos++; else empties.push(f);
  }
  ok('20 archives contain photos', withPhotos === 20, withPhotos);
  ok('97 photos in total', photos === 97, photos);
  ok('only the known archive is empty', JSON.stringify(empties) === JSON.stringify(['Nyagacho blocks ABC.zip']), empties);

  console.log('\n== titles derived from the real filenames ==');
  const t = M().titleFromFilename;
  ok('APC 1bdr 6500 Bedsitter 4500', t('APC 1bdr 6500 Bedsitter 4500.zip') === 'APC 1bdr 6500 Bedsitter 4500', t('APC 1bdr 6500 Bedsitter 4500.zip'));
  ok('trailing space before extension trimmed', t('Genesis double rooms 3500 .zip') === 'Genesis double rooms 3500', JSON.stringify(t('Genesis double rooms 3500 .zip')));
  ok('KSK near ACK Grace Church 2200', t('KSK near ACK Grace Church 2200.zip') === 'KSK near ACK Grace Church 2200');
  ok('lowercase name capitalised', t('amani flats 1500.zip') === 'Amani flats 1500', t('amani flats 1500.zip'));

  console.log('\n== boot against the real archives ==');
  const serve = {};
  for (const f of files) serve[f] = fs.readFileSync(path.join(REAL, f));
  const list = files.filter(f => f !== 'Nyagacho blocks ABC.zip');
  const dom2 = makeDom({
    preload: win => {
      win.fetch = async url => {
        const u = decodeURIComponent(String(url));
        if (u.endsWith('bundles.json')) return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => list };
        const name = decodeURIComponent(u.split('/').pop());
        if (serve[name]) return { ok: true, status: 200, headers: { get: () => 'application/zip' }, blob: async () => new win.Blob([serve[name]], { type: 'application/zip' }) };
        return { ok: false, status: 404, headers: { get: () => 'text/plain' } };
      };
    }
  });
  const M2 = () => dom2.window.Miracle;
  await wait(1500);
  ok('all 20 archives became bundles', M2().state.bundles.length === 20, M2().state.bundles.length);
  const total = M2().state.bundles.reduce((n, b) => n + b.photos.length, 0);
  ok('all 97 photos unpacked', total === 97, total);
  ok('titles match the filenames', M2().state.bundles.some(b => b.title === 'KPK 3500') && M2().state.bundles.some(b => b.title === 'Sigi 1300'));
  ok('empty archive produced no bundle', !M2().state.bundles.some(b => /Nyagacho blocks ABC/.test(b.title)));
  ok('read-only for the visitor', M2().publishedMode === true && !dom2.window.localStorage.getItem('miracle.v1'));

  console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });

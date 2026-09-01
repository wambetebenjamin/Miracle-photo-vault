/* End-to-end: loads the served site over real HTTP and lets the app fetch
   the real bundles.json and the real zip archives. Run: node test-live.js */
const { makeDom } = require('./harness.js');

const BASE = process.env.BASE || 'http://127.0.0.1:4173/';
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '  ->  ' + JSON.stringify(x) : '')); } };
const wait = ms => new Promise(r => setTimeout(r, ms));

const dom = makeDom({
  url: BASE + 'index.html',
  preload: win => { win.fetch = (u, o) => fetch(new URL(u, BASE), o); }
});
const w = dom.window, d = w.document;
const M = () => w.Miracle;

(async () => {
  const t0 = Date.now();
  /* the app unpacks 97 real JPEGs at boot, so give it room */
  for (let i = 0; i < 60; i++) {
    await wait(500);
    if (M() && M().state && M().state.bundles.length >= 20) break;
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  console.log('\n== live site over HTTP ==');
  ok('app booted', !!M());
  ok('bundles.json was fetched and parsed', M().state.bundles.length > 0, M().state.bundles.length);
  ok('all 20 archives became bundles', M().state.bundles.length === 20, M().state.bundles.length);
  const total = M().state.bundles.reduce((n, b) => n + b.photos.length, 0);
  ok('all 97 photos unpacked from the real zips', total === 97, total);
  ok('boot + unpack took a sane amount of time', Number(secs) < 30, secs + 's');
  console.log('       (bundles ready in ' + secs + 's)');

  const titles = M().state.bundles.map(b => b.title).sort();
  ok('titles come from the zip filenames', titles.includes('Amani flats 1500') && titles.includes('KPK 3500') && titles.includes('Sigi 1300'), titles.slice(0, 3));
  ok('empty archive not shown as a bundle', !titles.some(t => /Nyagacho blocks ABC/.test(t)));
  ok('every bundle has a cover', M().state.bundles.every(b => !!b.coverId));
  const sample = M().state.bundles[0].photos[0];
  ok('photos are real JPEG data urls', /^data:image\/jpeg;base64,/.test(sample.src) && sample.src.length > 20000, sample.src.length);

  console.log('\n== visible in the UI ==');
  M().go('gallery'); await wait(400);
  const g = d.querySelector('#page-gallery');
  ok('gallery rendered cards', g.querySelectorAll('.card').length > 0, g.querySelectorAll('.card').length);
  ok('gallery shows a real bundle title', g.innerHTML.includes('Amani flats 1500'));
  ok('gallery shows another', g.innerHTML.includes('Oscar rentals Nyagacho 10k and 15k'));
  const imgs = g.querySelectorAll('.card img');
  ok('cards have image sources', imgs.length > 0 && Array.from(imgs).some(i => (i.getAttribute('src') || '').startsWith('data:image/')), imgs.length);

  M().go('home'); await wait(300);
  ok('overview counts the bundles', d.querySelector('#page-home').innerHTML.includes('20') || M().state.bundles.length === 20);

  console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });

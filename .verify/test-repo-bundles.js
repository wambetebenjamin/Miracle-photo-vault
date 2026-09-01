/* Zips committed to the repo, served from the deployed link.
   Run: node test-repo-bundles.js */
const { makeDom, readBlob } = require('./harness.js');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '  ->  ' + JSON.stringify(x) : '')); } };
const wait = ms => new Promise(r => setTimeout(r, ms));

/* First document: build real zip bytes with the app's own writer. */
const build = makeDom();
const bw = build.window;
const BM = () => bw.Miracle;

(async () => {
  await wait(400);
  const mk = async (entries) => {
    const blob = BM().buildZip(entries.map(e => ({ name: e[0], data: new TextEncoder().encode(e[1]) })));
    return await readBlob(bw, blob);
  };
  const zipBytes = {
    'Wedding.zip': await mk([['w1.jpg', 'A'], ['w2.jpg', 'B']]),
    'Kericho_Trip-2024.zip': await mk([['k1.jpg', 'C'], ['k2.jpg', 'D'], ['k3.jpg', 'E'], ['readme.txt', 'skip']])
  };
  ok('built real zip fixtures', zipBytes['Wedding.zip'].length > 100);

  console.log('\n== visitor loads the deployed site ==');
  const dom = makeDom({
    preload: win => {
      win.fetch = async url => {
        const u = String(url);
        if (u.endsWith('bundles.json')) {
          return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ['bundles/Wedding.zip', 'bundles/Kericho_Trip-2024.zip', 'bundles/Missing.zip'] };
        }
        const name = decodeURIComponent(u.split('/').pop());
        if (zipBytes[name]) {
          return { ok: true, status: 200, headers: { get: () => 'application/zip' }, blob: async () => new win.Blob([zipBytes[name]], { type: 'application/zip' }) };
        }
        return { ok: false, status: 404, headers: { get: () => 'text/plain' } };
      };
    }
  });
  const w = dom.window, d = w.document;
  const M = () => w.Miracle;
  await wait(900);

  ok('repo bundles loaded at boot', M().state.bundles.length === 2, M().state.bundles.map(b => b.title));
  const titles = M().state.bundles.map(b => b.title).sort();
  ok('titles come from the zip filenames', JSON.stringify(titles) === JSON.stringify(['Kericho Trip 2024', 'Wedding']), titles);
  const wed = M().state.bundles.find(b => b.title === 'Wedding');
  const ker = M().state.bundles.find(b => b.title === 'Kericho Trip 2024');
  ok('photos unpacked from each zip', wed.photos.length === 2 && ker.photos.length === 3, [wed.photos.length, ker.photos.length]);
  ok('non-image entries skipped', !ker.photos.some(p => /readme/i.test(p.name)));
  ok('photos are usable data urls', ker.photos.every(p => /^data:image\/jpeg;base64,/.test(p.src)));
  ok('covers assigned', !!wed.coverId && !!ker.coverId);
  ok('a 404 zip is skipped, not fatal', M().state.bundles.length === 2);
  ok('treated as a shared archive', M().publishedMode === true);
  ok('visitor storage untouched', !w.localStorage.getItem('miracle.v1'));
  await M().persist(); await wait(150);
  ok('persist still a no-op', !w.localStorage.getItem('miracle.v1'));

  M().go('gallery'); await wait(250);
  const html = d.querySelector('#page-gallery').innerHTML;
  ok('gallery shows both bundles', html.includes('Wedding') && html.includes('Kericho Trip 2024'));

  console.log('\n== no bundles.json ==');
  const plain = makeDom({ preload: win => { win.fetch = async () => ({ ok: false, status: 404, headers: { get: () => 'text/plain' } }); } });
  await wait(500);
  ok('app boots normally without a manifest', plain.window.Miracle.state.bundles.length === 0);

  console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });

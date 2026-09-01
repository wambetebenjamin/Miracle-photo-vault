/* Shared jsdom harness for Miracle.
   - No indexedDB, so the app falls back to localStorage (idbOpen rejects).
   - Fake canvas/Image so image processing runs without real decoding.
   - Anchor clicks are captured instead of navigating, so exports are inspectable. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const downloads = [];
const pending = new Map();

function makeDom(opts) {
  opts = opts || {};
  downloads.length = 0;
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: opts.url || 'https://test.local/index.html',
    beforeParse(w) {
      delete w.indexedDB;
      w.TextEncoder = TextEncoder;
      w.TextDecoder = TextDecoder;
      Object.keys(opts.seed || {}).forEach(k => w.localStorage.setItem(k, opts.seed[k]));
      if (typeof opts.preload === 'function') opts.preload(w);

      let dims = { w: 1200, h: 800 };
      Object.defineProperty(w, '__imgDims', { get() { return dims; }, set(v) { dims = v; } });

      w.HTMLCanvasElement.prototype.getContext = function () {
        return {
          imageSmoothingEnabled: true, fillStyle: '#fff',
          drawImage() {}, fillRect() {}, clearRect() {}, save() {}, restore() {},
          translate() {}, rotate() {}, scale() {}, setTransform() {},
          beginPath() {}, closePath() {}, arc() {}, fill() {}, stroke() {},
          moveTo() {}, lineTo() {},
          getImageData(x, y, ww, hh) { return { data: new Uint8ClampedArray(Math.max(1, ww * hh * 4)) }; },
          putImageData() {}
        };
      };
      const fake = c => 'data:image/jpeg;base64,' + Buffer.from('FAKE' + c.width + 'x' + c.height).toString('base64');
      w.HTMLCanvasElement.prototype.toDataURL = function () { return fake(this); };
      w.HTMLCanvasElement.prototype.toBlob = function (cb) {
        const b64 = fake(this).split(',')[1];
        setTimeout(() => cb(new w.Blob([Buffer.from(b64, 'base64')], { type: 'image/jpeg' })), 0);
      };

      class FakeImage {
        constructor() { this._src = ''; this.onload = null; this.onerror = null; }
        get width() { return dims.w; }
        get height() { return dims.h; }
        get naturalWidth() { return dims.w; }
        get naturalHeight() { return dims.h; }
        set src(v) { this._src = v; setTimeout(() => { if (this.onload) this.onload(); }, 0); }
        get src() { return this._src; }
      }
      w.Image = FakeImage;

      w.URL.createObjectURL = b => { const u = 'blob:t/' + Math.random().toString(36).slice(2); pending.set(u, b); return u; };
      w.URL.revokeObjectURL = () => {};
      w.HTMLAnchorElement.prototype.click = function () {
        downloads.push({ name: this.getAttribute('download'), blob: pending.get(this.getAttribute('href')) });
      };

      w.scrollTo = () => {};
      if (!w.matchMedia) {
        w.matchMedia = q => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } });
      }
      if (!w.ResizeObserver) w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      if (!w.crypto) w.crypto = {};
      if (!w.crypto.randomUUID) w.crypto.randomUUID = () => 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
  });
  return dom;
}

/* jsdom Blobs have no arrayBuffer(); read them through FileReader. */
function readBlob(w, blob) {
  return new Promise((res, rej) => {
    const fr = new w.FileReader();
    fr.onload = () => res(Buffer.from(fr.result));
    fr.onerror = () => rej(new Error('blob read failed'));
    fr.readAsArrayBuffer(blob);
  });
}
const readText = (w, blob) => readBlob(w, blob).then(b => b.toString('utf8'));

module.exports = { makeDom, downloads, pending, readBlob, readText, HTML };

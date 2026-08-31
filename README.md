# Miracle — Photo Archive

A single-file photo archive. Group photos into bundles, caption them, file them
under categories, and export them at any size.

Everything runs in the browser. Photos are stored in IndexedDB on your own
device. Nothing is uploaded to a server.

## Run it

Open `index.html` in a browser, or serve the directory:

```
python3 -m http.server 8000
```

## Deploy

Static site. No build step, no dependencies, no server code.

**Vercel** — Add New → Project → import this repository. Framework preset
*Other*, Build Command empty, Output Directory empty. `vercel.json` sets the
cache and security headers. Production tracks `main`; every other branch and
pull request gets its own preview URL.

**GitHub Pages** — Settings → Pages → Source: *Deploy from a branch* → `main`,
`/ (root)`.

**Netlify / Cloudflare Pages** — connect the repository, leave the build command
empty, publish directory `/`.

## Notes

- Photos are resized to a longest edge of 2200px and re-encoded as JPEG on
  import. The original files on your device are not modified.
- Archives written by the previous version of this page (localStorage key
  `photoVaultData`) are migrated automatically on first load, and the old key is
  left in place.
- Images can be added by pasting (`Ctrl`/`Cmd`+`V`) anywhere on the page, by
  dragging files onto the window, or from the file picker.
- Use *More → Export archive* to write a JSON copy of every bundle and photo.
- Storage is per browser and per origin. Clearing site data removes the archive,
  so export before switching browsers or domains.

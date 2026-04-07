# APIScope — Schema Inspector

Chrome/Firefox extension that intercepts `fetch` and `XHR` requests, infers JSON schemas, detects PII, and compresses repeated data for easier debugging.

## Features

- **Intercepts** `fetch` and `XMLHttpRequest` calls on any page
- **Schema inference** — detects field types, formats, enums, min/max ranges
- **PII detection** — flags CPF, CNPJ, email, phone, CEP, JWT, credit cards, IPs
- **Scrub & Copy** — replaces PII with tags like `[CPF]`, `[EMAIL]` in one click
- **Compress** — extracts repeated values from arrays into a `_comum` block

## Install on Chrome

1. Download or clone this repository
2. Open `chrome://extensions` in your browser
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked**
5. Select the `dist/chrome` folder (run `./build.sh chrome` first if it doesn't exist)

## Install on Firefox

1. Download or clone this repository
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on…**
4. Select any file inside `dist/firefox` (run `./build.sh firefox` first if it doesn't exist)

> Requires Firefox 128 or newer.

## Build

```bash
./build.sh chrome    # creates dist/chrome/
./build.sh firefox   # creates dist/firefox/
```

## How to Use

1. Install the extension (see above)
2. Open any website that makes API calls
3. Click the **APIScope** icon in the toolbar
4. You'll see a list of captured requests
5. Click a request to inspect it

### Detail Tabs

| Tab | What it does |
|-----|-------------|
| **Schema** | Shows inferred field types, formats, enums, and ranges |
| **Scrub & Copy** | Displays JSON with PII replaced by tags, with copy buttons |
| **Compactar** | Compresses the JSON by extracting repeated array values into `_comum` |
| **Raw JSON** | Pretty-printed original response |

### Tips

- Use the **filter bar** to search by URL or HTTP method
- Click the refresh button to load new requests
- The extension captures up to 200 requests per tab, max 512KB per response

## Project Structure

```
apiscope-ext/
├── manifest.json           # Chrome manifest (MV3)
├── manifest.firefox.json   # Firefox manifest (MV3)
├── background.js           # Service worker / event page
├── interceptor.js          # Patches fetch/XHR (MAIN world)
├── bridge.js               # Bridges page events to extension (ISOLATED world)
├── schema.js               # Schema inference, PII scrubbing, compression
├── popup.html              # Extension popup UI
├── popup.js                # Popup logic and renderers
├── icons/                  # Extension icons (16, 48, 128px)
└── build.sh                # Build script for Chrome/Firefox
```

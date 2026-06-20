# CompMaker

A modern Adobe After Effects CEP panel for creating project-specific
compositions from saved presets — **one click per comp**.

If you constantly recreate comps with the same resolution, duration, frame
rate, and background color, CompMaker turns that into a single click. Save
presets, organize them per project, and share libraries with your team.

![CompMaker](assets/screenshot.png)

---

## Features

- **Preset cards** with a live aspect-ratio preview, resolution, and FPS.
- **One-click create** with automatic incremental naming (`Main Screen_01`,
  `Main Screen_02`, …). **Shift-click** a card to type a custom name.
- **Add Preset** manually, or **Use Active Comp as Preset** to capture the
  current composition's settings.
- **Multiple projects**, each with its own independent preset library —
  create, rename, duplicate, delete, switch. Active project is remembered.
- **Per-preset actions** (Edit / Duplicate / Delete / Export) via a three-dot
  menu or right-click.
- **Import / Export** whole libraries or single presets as `.compmaker.json`,
  with **Replace / Merge / Create Copy** when a project already exists.
- **Drag & drop** a `.compmaker.json` onto the panel to import.
- **Local JSON persistence** with a versioned, forward-compatible schema.
- Clean, dark, modern UI; dockable AE panel.

---

## Installation

### For development (recommended) — live symlink

This links the repo directly into the CEP extensions folder so every edit is
reflected in After Effects after a panel reload — no manual copying.

**macOS**
```bash
git clone https://github.com/javigildd/compmaker.git
cd compmaker
./scripts/install-mac.sh
```

**Windows** (run the terminal / script **as Administrator** — `mklink` needs it)
```bat
git clone https://github.com/javigildd/compmaker.git
cd compmaker
scripts\install-win.bat
```

The scripts also enable **PlayerDebugMode** so the unsigned extension loads.

Then restart After Effects and open **Window → Extensions → CompMaker**.

#### Manual symlink (if you prefer)

**macOS**
```bash
ln -s "/full/path/to/compmaker" \
  "$HOME/Library/Application Support/Adobe/CEP/extensions/com.compmaker"
```

**Windows** (Administrator command prompt)
```bat
mklink /D "%APPDATA%\Adobe\CEP\extensions\com.compmaker" "C:\full\path\to\compmaker"
```

#### Enable unsigned extensions manually (if needed)

**macOS** (`N` = your CEP version, typically 11 or 12)
```bash
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
```

**Windows** — set `HKEY_CURRENT_USER/Software/Adobe/CSXS.11` → `PlayerDebugMode` (String) = `1`.

---

## Usage

1. Open **Window → Extensions → CompMaker**.
2. Pick a project from the top-bar dropdown.
3. **Click** a preset card → a new comp is created and opened instantly.
4. **Shift-click** a card → type a custom comp name.
5. **Add Preset** (bottom bar) or **Use Active Comp** to capture the open comp.
6. Use the **⠿** project menu to manage projects, and the **↓ / ↑** icons to
   import / export libraries. Everything saves automatically.

---

## Development

### Project structure

```
CompMaker/
├── CSXS/manifest.xml      Extension manifest (id, host, panel geometry)
├── index.html             Panel markup + script order
├── css/style.css          Dark, modern theme
├── lib/CSInterface.js     Minimal CEP bridge (evalScript, paths, events)
├── js/
│   ├── storage.js         Data model + JSON persistence (no UI / no AE)
│   ├── ui.js              Rendering, modals, menus, toasts (no AE / no data IO)
│   └── main.js            Controller: wires UI ↔ Storage ↔ host
├── jsx/host.jsx           All After Effects logic (ExtendScript)
├── scripts/               macOS / Windows dev-symlink installers
├── .debug                 Remote-debugging config (port 8088)
├── CHANGELOG.md
└── README.md
```

### Architecture

Strict separation of concerns:

- **`jsx/host.jsx`** is the only code that touches the AE DOM. Each entry point
  takes/returns JSON strings of the form `{ ok, … }`.
- **`js/storage.js`** owns the data model and persistence. It knows nothing
  about the DOM or After Effects.
- **`js/ui.js`** is pure presentation, driven entirely through a `handlers`
  callback object — it never imports Storage or calls the host.
- **`js/main.js`** is the controller and the only place that bridges all three,
  via `CSInterface.evalScript`.

### Edit / reload loop

1. Edit files in the repo.
2. In After Effects, close and reopen the CompMaker panel (or relaunch AE) to
   reload the changed code.
3. Optional: open `http://localhost:8088` in a Chromium browser for DevTools
   (configured in `.debug`).

### Data file

Presets persist to JSON in the host user-data folder:

- **macOS** `~/Library/Application Support/CompMaker/compmaker-data.json`
- **Windows** `%APPDATA%\CompMaker\compmaker-data.json`

(Exact path is shown in the Settings dialog.) The schema is versioned
(`schemaVersion`) and additive, so new fields can be introduced without breaking
existing files.

### Future-proofing

The data model already carries placeholder fields (`tags`, `favorite`,
`usageCount`, `metadata`, `lastUsedAt`) so planned features — favorites, tags,
search, recently-used, templates, folders, thumbnails, team sync, multiple
libraries, naming rules, usage stats, custom metadata — can be added without a
migration.

---

## License

MIT — see headers / repository for details.

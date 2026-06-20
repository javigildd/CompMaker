# Changelog

All notable changes to CompMaker are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Preset cards now show the **aspect-ratio format** (e.g. `16:9`, `9:16`,
  `2.39:1`) next to the FPS.

### Removed
- Background-color picker in the preset form (new comps default to black).

### Changed
- **Smaller preset cards** with a new **Card size** setting (Small / Medium /
  Large) in Settings; defaults to Small and persists between sessions.
- Preset aspect-ratio **outlines are now light blue**.
- **Add Preset** moved to the top bar as a compact light-blue **+** icon;
  **Use Active Comp** is now an import-style icon button. The bottom bar is gone.
- Settings icon is now a **cogwheel** (was a sun-like glyph).

## [1.0.0] — 2026-06-20

### Added
- **Composition presets** — save name, width, height, duration, frame rate, and
  background color; each rendered as a card with a scaled aspect-ratio preview,
  resolution, and FPS.
- **One-click comp creation** — click a card to instantly create a comp with
  auto-incremented naming (`Name_01`, `Name_02`, …). **Shift-click** to enter a
  custom name.
- **Add Preset** modal and **Use Active Comp as Preset** (reads the active comp,
  pre-fills an editable form).
- **Multiple projects** with a top-bar selector — create, rename, duplicate,
  delete, and switch. The active project is remembered between sessions.
- **Preset management** — edit, duplicate, delete, and export via a three-dot
  menu or right-click context menu.
- **Import / Export** of project libraries and individual presets as
  `*.compmaker.json`, with Replace / Merge / Create-Copy conflict handling.
- **Drag & drop** a `.compmaker.json` file onto the panel to import.
- **Local JSON persistence** in the host user-data folder (localStorage fallback),
  with a versioned, forward-compatible schema.
- **Settings** panel showing version, host, and data-file location, plus a reset.
- Live-development symlink scripts for macOS and Windows.

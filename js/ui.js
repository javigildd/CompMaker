/**
 * CompMaker — UI
 * --------------------------------------------------------------------------
 * Pure presentation layer: builds DOM, renders preset cards, and provides
 * reusable modal / menu / toast primitives. It knows nothing about After
 * Effects or persistence — it talks to the rest of the app exclusively
 * through the `handlers` object supplied to UI.init(). This keeps the AE
 * logic (host.jsx) and the data logic (storage.js) fully decoupled.
 *
 * Exposed as `window.UI`.
 */
window.UI = (function () {
    'use strict';

    var handlers = {};
    var els = {}; // cached top-level element references
    var currentCardSize = 'small';

    // Per-size layout: max preview box (w,h) the aspect-ratio outline fits in.
    var PREVIEW_BOUNDS = {
        small:  { w: 78,  h: 36 },
        medium: { w: 104, h: 50 },
        large:  { w: 130, h: 64 }
    };
    var CARD_SIZES = ['small', 'medium', 'large'];

    // ---- tiny DOM helpers -------------------------------------------------

    /** Create an element with attributes/props and children. */
    function el(tag, opts, children) {
        var node = document.createElement(tag);
        opts = opts || {};
        Object.keys(opts).forEach(function (key) {
            if (key === 'class') {
                node.className = opts[key];
            } else if (key === 'html') {
                node.innerHTML = opts[key];
            } else if (key === 'text') {
                node.textContent = opts[key];
            } else if (key === 'dataset') {
                Object.keys(opts.dataset).forEach(function (d) {
                    node.dataset[d] = opts.dataset[d];
                });
            } else if (key.slice(0, 2) === 'on' && typeof opts[key] === 'function') {
                node.addEventListener(key.slice(2).toLowerCase(), opts[key]);
            } else if (opts[key] !== null && opts[key] !== undefined) {
                node.setAttribute(key, opts[key]);
            }
        });
        (children || []).forEach(function (c) {
            if (c == null) { return; }
            node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
        });
        return node;
    }

    function clear(node) {
        while (node.firstChild) { node.removeChild(node.firstChild); }
    }

    // ---- color helpers ----------------------------------------------------

    function rgbToHex(rgb) {
        function h(n) {
            var s = Math.max(0, Math.min(255, Math.round(n))).toString(16);
            return s.length === 1 ? '0' + s : s;
        }
        return '#' + h(rgb[0]) + h(rgb[1]) + h(rgb[2]);
    }

    function hexToRgb(hex) {
        var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
        if (!m) { return [0, 0, 0]; }
        var i = parseInt(m[1], 16);
        return [(i >> 16) & 255, (i >> 8) & 255, i & 255];
    }

    // ---- formatting -------------------------------------------------------

    /** "29.97 fps", "30 fps" — trims pointless trailing zeros. */
    function fmtFps(fps) {
        var n = Number(fps);
        var s = (Math.round(n * 100) / 100).toString();
        return s + ' fps';
    }

    /** Compute the inner preview box size that fits a w:h ratio in a frame. */
    function fitPreview(w, h, maxW, maxH) {
        var scale = Math.min(maxW / w, maxH / h);
        // Guard against absurd ratios so the bar never disappears.
        var iw = Math.max(8, Math.round(w * scale));
        var ih = Math.max(8, Math.round(h * scale));
        return { w: iw, h: ih };
    }

    // ---- init -------------------------------------------------------------

    function init(h) {
        handlers = h || {};
        els.projectSelect = document.getElementById('projectSelect');
        els.projectMenuBtn = document.getElementById('projectMenuBtn');
        els.settingsBtn = document.getElementById('settingsBtn');
        els.presetGrid = document.getElementById('presetGrid');
        els.addPresetBtn = document.getElementById('addPresetBtn');
        els.useActiveBtn = document.getElementById('useActiveBtn');

        els.projectSelect.addEventListener('change', function () {
            handlers.onSwitchProject(els.projectSelect.value);
        });
        els.projectMenuBtn.addEventListener('click', openProjectMenu);
        els.settingsBtn.addEventListener('click', function () { handlers.onSettings(); });
        els.addPresetBtn.addEventListener('click', function () { handlers.onAddPreset(); });
        els.useActiveBtn.addEventListener('click', function () { handlers.onUseActiveComp(); });
    }

    // ---- rendering --------------------------------------------------------

    /** Apply a card size ('small'|'medium'|'large') to the grid. */
    function setCardSize(size) {
        if (CARD_SIZES.indexOf(size) === -1) { size = 'small'; }
        currentCardSize = size;
        if (els.presetGrid) {
            els.presetGrid.className = 'preset-grid size-' + size;
        }
    }

    function renderProjects(projects, activeId) {
        clear(els.projectSelect);
        projects.forEach(function (p) {
            var opt = el('option', { value: p.id, text: p.name });
            if (p.id === activeId) { opt.selected = true; }
            els.projectSelect.appendChild(opt);
        });
        if (!projects.length) {
            els.projectSelect.appendChild(el('option', { text: 'No projects', value: '' }));
        }
    }

    function renderPresets(presets) {
        clear(els.presetGrid);
        (presets || []).forEach(function (preset) {
            els.presetGrid.appendChild(buildCard(preset));
        });
    }

    /** Build one preset card. */
    function buildCard(preset) {
        // Aspect-ratio preview, scaled to the stored width/height.
        var bounds = PREVIEW_BOUNDS[currentCardSize] || PREVIEW_BOUNDS.small;
        var size = fitPreview(preset.width, preset.height, bounds.w, bounds.h);
        var ratioBox = el('div', { class: 'ratio-box' }, [
            el('div', {
                class: 'ratio-inner',
                style: 'width:' + size.w + 'px;height:' + size.h + 'px;' +
                       'background:' + rgbToHex(preset.backgroundColor) + ';'
            })
        ]);

        var menuBtn = el('button', {
            class: 'card-menu-btn',
            title: 'Preset actions',
            'aria-label': 'Preset actions',
            html: dots()
        });
        menuBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            openCardMenu(preset, menuBtn);
        });

        var card = el('div', {
            class: 'card',
            dataset: { id: preset.id },
            title: 'Click to create  ·  Shift-click to name it'
        }, [
            menuBtn,
            ratioBox,
            el('div', { class: 'card-name', text: preset.name }),
            el('div', { class: 'card-res', text: preset.width + ' × ' + preset.height }),
            el('div', { class: 'card-fps', text: fmtFps(preset.fps) })
        ]);

        card.addEventListener('click', function (e) {
            handlers.onPresetClick(preset.id, e.shiftKey);
        });
        // Right-click opens the same action menu.
        card.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            openCardMenu(preset, menuBtn);
        });
        return card;
    }

    // ---- toast ------------------------------------------------------------

    function toast(message, type) {
        var root = document.getElementById('toastRoot');
        var t = el('div', { class: 'toast toast-' + (type || 'info'), text: message });
        root.appendChild(t);
        // Force reflow then animate in.
        void t.offsetWidth;
        t.classList.add('show');
        setTimeout(function () {
            t.classList.remove('show');
            setTimeout(function () { if (t.parentNode) { t.parentNode.removeChild(t); } }, 250);
        }, 2600);
    }

    // ---- menus ------------------------------------------------------------

    function closeMenus() {
        var root = document.getElementById('menuRoot');
        clear(root);
        document.removeEventListener('mousedown', onDocDownForMenu, true);
    }

    function onDocDownForMenu(e) {
        if (!e.target.closest('.menu')) { closeMenus(); }
    }

    /** Show a popup menu of {label, danger?, onClick} items near an anchor. */
    function showMenu(items, anchorEl) {
        closeMenus();
        var root = document.getElementById('menuRoot');
        var menu = el('div', { class: 'menu' });
        items.forEach(function (item) {
            if (item.separator) {
                menu.appendChild(el('div', { class: 'menu-sep' }));
                return;
            }
            var mi = el('button', {
                class: 'menu-item' + (item.danger ? ' danger' : ''),
                text: item.label
            });
            mi.addEventListener('click', function () {
                closeMenus();
                item.onClick();
            });
            menu.appendChild(mi);
        });
        root.appendChild(menu);

        // Position under the anchor, kept inside the viewport.
        var r = anchorEl.getBoundingClientRect();
        var mw = menu.offsetWidth;
        var mh = menu.offsetHeight;
        var left = Math.min(r.left, window.innerWidth - mw - 8);
        var top = r.bottom + 6;
        if (top + mh > window.innerHeight - 8) {
            top = Math.max(8, r.top - mh - 6);
        }
        menu.style.left = Math.max(8, left) + 'px';
        menu.style.top = top + 'px';

        setTimeout(function () {
            document.addEventListener('mousedown', onDocDownForMenu, true);
        }, 0);
    }

    function openProjectMenu() {
        showMenu([
            { label: 'New Project…', onClick: function () { handlers.onCreateProject(); } },
            { label: 'Rename Project…', onClick: function () { handlers.onRenameProject(); } },
            { label: 'Duplicate Project', onClick: function () { handlers.onDuplicateProject(); } },
            { separator: true },
            { label: 'Export Project…', onClick: function () { handlers.onExportProject(); } },
            { separator: true },
            { label: 'Delete Project', danger: true, onClick: function () { handlers.onDeleteProject(); } }
        ], els.projectMenuBtn);
    }

    function openCardMenu(preset, anchorEl) {
        showMenu([
            { label: 'Create Comp', onClick: function () { handlers.onPresetClick(preset.id, false); } },
            { label: 'Create with Name…', onClick: function () { handlers.onPresetClick(preset.id, true); } },
            { separator: true },
            { label: 'Edit…', onClick: function () { handlers.onEditPreset(preset.id); } },
            { label: 'Duplicate', onClick: function () { handlers.onDuplicatePreset(preset.id); } },
            { label: 'Export Preset…', onClick: function () { handlers.onExportPreset(preset.id); } },
            { separator: true },
            { label: 'Delete', danger: true, onClick: function () { handlers.onDeletePreset(preset.id); } }
        ], anchorEl);
    }

    // ---- modal core -------------------------------------------------------

    /** Open a modal. Returns the overlay element. `body` is an array of nodes. */
    function openModal(opts) {
        var root = document.getElementById('modalRoot');
        var overlay = el('div', { class: 'modal-overlay' });
        var dialog = el('div', { class: 'modal' });

        var header = el('div', { class: 'modal-header' }, [
            el('div', { class: 'modal-title', text: opts.title || '' })
        ]);
        var body = el('div', { class: 'modal-body' }, opts.body || []);
        var footer = el('div', { class: 'modal-footer' }, opts.footer || []);

        dialog.appendChild(header);
        dialog.appendChild(body);
        if (opts.footer && opts.footer.length) { dialog.appendChild(footer); }
        overlay.appendChild(dialog);
        root.appendChild(overlay);

        function close() {
            overlay.classList.remove('show');
            setTimeout(function () { if (overlay.parentNode) { overlay.parentNode.removeChild(overlay); } }, 180);
            document.removeEventListener('keydown', onKey);
        }
        function onKey(e) {
            if (e.key === 'Escape') { close(); }
        }
        overlay.addEventListener('mousedown', function (e) {
            if (e.target === overlay && opts.dismissable !== false) { close(); }
        });
        document.addEventListener('keydown', onKey);

        void overlay.offsetWidth;
        overlay.classList.add('show');

        return { overlay: overlay, dialog: dialog, body: body, footer: footer, close: close };
    }

    function button(label, kind, onClick) {
        return el('button', {
            class: 'btn ' + (kind || 'btn-ghost'),
            text: label,
            onClick: onClick
        });
    }

    // ---- field builders for the preset form ------------------------------

    function field(labelText, inputNode) {
        return el('label', { class: 'field' }, [
            el('span', { class: 'field-label', text: labelText }),
            inputNode
        ]);
    }

    /**
     * Preset add/edit modal (also used by "Use Active Comp").
     * @param {object} cfg { title, preset, submitLabel, onSubmit(data) }
     */
    function openPresetModal(cfg) {
        var p = cfg.preset || {};
        var nameInput = el('input', { class: 'inp', type: 'text', value: p.name || '', placeholder: 'Preset name' });
        var widthInput = el('input', { class: 'inp', type: 'number', min: '1', step: '1', value: p.width || 1920 });
        var heightInput = el('input', { class: 'inp', type: 'number', min: '1', step: '1', value: p.height || 1080 });
        var durInput = el('input', { class: 'inp', type: 'number', min: '0.1', step: '0.1', value: p.duration || 10 });
        var fpsInput = el('input', { class: 'inp', type: 'number', min: '1', step: '0.001', value: p.fps || 30 });
        var colorHex = rgbToHex(p.backgroundColor || [0, 0, 0]);
        var colorInput = el('input', { class: 'inp-color', type: 'color', value: colorHex });

        var error = el('div', { class: 'form-error', text: '' });

        var grid = el('div', { class: 'form-grid' }, [
            field('Width', widthInput),
            field('Height', heightInput),
            field('Duration (s)', durInput),
            field('Frame Rate', fpsInput)
        ]);

        var body = [
            field('Name', nameInput),
            grid,
            field('Background Color', colorInput),
            error
        ];

        var modal;

        function submit() {
            var data = {
                name: nameInput.value.trim(),
                width: parseInt(widthInput.value, 10),
                height: parseInt(heightInput.value, 10),
                duration: parseFloat(durInput.value),
                fps: parseFloat(fpsInput.value),
                backgroundColor: hexToRgb(colorInput.value)
            };
            if (!data.name) { error.textContent = 'Please enter a name.'; return; }
            if (!(data.width > 0 && data.height > 0)) { error.textContent = 'Width and height must be positive.'; return; }
            if (!(data.duration > 0)) { error.textContent = 'Duration must be greater than 0.'; return; }
            if (!(data.fps > 0)) { error.textContent = 'Frame rate must be greater than 0.'; return; }
            modal.close();
            cfg.onSubmit(data);
        }

        var footer = [
            button('Cancel', 'btn-ghost', function () { modal.close(); }),
            button(cfg.submitLabel || 'Save', 'btn-primary', submit)
        ];

        modal = openModal({ title: cfg.title || 'Preset', body: body, footer: footer });

        // Enter submits from any text/number input.
        modal.body.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'color') {
                submit();
            }
        });
        setTimeout(function () { nameInput.focus(); nameInput.select(); }, 30);
    }

    /** Simple single-text-field prompt. */
    function prompt(cfg) {
        var input = el('input', { class: 'inp', type: 'text', value: cfg.value || '', placeholder: cfg.placeholder || '' });
        var modal;
        function submit() {
            var v = input.value.trim();
            if (cfg.required && !v) { return; }
            modal.close();
            cfg.onSubmit(v);
        }
        modal = openModal({
            title: cfg.title || '',
            body: [
                cfg.message ? el('p', { class: 'modal-text', text: cfg.message }) : null,
                field(cfg.label || 'Name', input)
            ],
            footer: [
                button('Cancel', 'btn-ghost', function () { modal.close(); }),
                button(cfg.submitLabel || 'OK', 'btn-primary', submit)
            ]
        });
        modal.body.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { submit(); }
        });
        setTimeout(function () { input.focus(); input.select(); }, 30);
    }

    /** Confirmation dialog. onConfirm() called if the primary button is hit. */
    function confirm(cfg) {
        var modal = openModal({
            title: cfg.title || 'Are you sure?',
            body: [el('p', { class: 'modal-text', text: cfg.message || '' })],
            footer: [
                button(cfg.cancelLabel || 'Cancel', 'btn-ghost', function () { modal.close(); }),
                button(cfg.confirmLabel || 'Confirm', cfg.danger ? 'btn-danger' : 'btn-primary', function () {
                    modal.close();
                    cfg.onConfirm();
                })
            ]
        });
    }

    /** Import-conflict chooser: Replace / Merge / Create New Copy. */
    function chooseImportMode(cfg) {
        var modal = openModal({
            title: 'Project Already Exists',
            body: [
                el('p', { class: 'modal-text', text:
                    'A project named "' + cfg.name + '" already exists. How would you like to import it?' })
            ],
            footer: [
                button('Cancel', 'btn-ghost', function () { modal.close(); }),
                button('Create Copy', 'btn-ghost', function () { modal.close(); cfg.onChoose('copy'); }),
                button('Merge', 'btn-ghost', function () { modal.close(); cfg.onChoose('merge'); }),
                button('Replace', 'btn-danger', function () { modal.close(); cfg.onChoose('replace'); })
            ]
        });
    }

    /** Build the Small / Medium / Large segmented control for card size. */
    function buildCardSizeControl(current, onChange) {
        var group = el('div', { class: 'segmented' });
        var buttons = {};
        CARD_SIZES.forEach(function (size) {
            var label = size.charAt(0).toUpperCase() + size.slice(1);
            var b = el('button', {
                class: 'segmented-btn' + (size === current ? ' active' : ''),
                text: label
            });
            b.addEventListener('click', function () {
                CARD_SIZES.forEach(function (s) { buttons[s].classList.remove('active'); });
                b.classList.add('active');
                onChange(size);
            });
            buttons[size] = b;
            group.appendChild(b);
        });
        return group;
    }

    /** Settings / about modal. */
    function openSettings(cfg) {
        var modal;

        // Library actions live here now (import / export of the active project).
        var importBtn = button('Import…', 'btn-ghost', function () {
            modal.close();
            cfg.onImport();
        });
        var exportBtn = button('Export…', 'btn-ghost', function () {
            modal.close();
            cfg.onExport();
        });
        var libraryRow = el('div', { class: 'settings-row' }, [
            el('span', { class: 'settings-key', text: 'Library' }),
            el('div', { class: 'settings-actions' }, [importBtn, exportBtn])
        ]);

        modal = openModal({
            title: 'Settings',
            body: [
                el('div', { class: 'settings-row' }, [
                    el('span', { class: 'settings-key', text: 'Card size' }),
                    buildCardSizeControl(cfg.cardSize || 'small', cfg.onSetCardSize)
                ]),
                libraryRow,
                el('div', { class: 'settings-row' }, [
                    el('span', { class: 'settings-key', text: 'Version' }),
                    el('span', { class: 'settings-val', text: cfg.version })
                ]),
                el('div', { class: 'settings-row' }, [
                    el('span', { class: 'settings-key', text: 'Host' }),
                    el('span', { class: 'settings-val', text: cfg.host || 'Unknown' })
                ]),
                el('div', { class: 'settings-row col' }, [
                    el('span', { class: 'settings-key', text: 'Data file' }),
                    el('span', { class: 'settings-path', text: cfg.dataPath })
                ]),
                el('p', { class: 'modal-text muted', text:
                    'Tip: Click a preset to create a comp. Shift-click to name it.' })
            ],
            footer: [
                button('Reset All Data', 'btn-danger', function () {
                    modal.close();
                    cfg.onReset();
                }),
                button('Close', 'btn-primary', function () { modal.close(); })
            ]
        });
    }

    // ---- icons ------------------------------------------------------------

    function dots() {
        return '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">' +
            '<circle cx="8" cy="3" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="8" cy="13" r="1.4"/></svg>';
    }

    return {
        init: init,
        setCardSize: setCardSize,
        renderProjects: renderProjects,
        renderPresets: renderPresets,
        toast: toast,
        openPresetModal: openPresetModal,
        prompt: prompt,
        confirm: confirm,
        chooseImportMode: chooseImportMode,
        openSettings: openSettings,
        rgbToHex: rgbToHex
    };
})();

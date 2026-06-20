/**
 * CompMaker — main / controller
 * --------------------------------------------------------------------------
 * Wires together Storage (data), UI (presentation) and the ExtendScript host
 * (After Effects). This is the only file that knows about all three. It owns
 * the CSInterface bridge and translates UI intents into storage mutations and
 * host calls, then re-renders.
 */
(function () {
    'use strict';

    var APP_VERSION = '1.0.0';
    var csInterface = new CSInterface();

    // ---- host bridge ------------------------------------------------------

    /**
     * Call a function on the `CompMaker` ExtendScript namespace and resolve
     * with its parsed JSON result.
     * @param {string} fnName e.g. 'createComp'
     * @param {Array<string>} [jsArgLiterals] Already-serialised JS literals.
     * @returns {Promise<object>}
     */
    function callHost(fnName, jsArgLiterals) {
        return new Promise(function (resolve) {
            var argStr = (jsArgLiterals || []).join(', ');
            var script = 'CompMaker.' + fnName + '(' + argStr + ')';
            csInterface.evalScript(script, function (result) {
                if (result === 'EvalScript error.' || result === undefined) {
                    resolve({ ok: false, error: 'Could not reach After Effects (EvalScript error).' });
                    return;
                }
                try {
                    resolve(JSON.parse(result));
                } catch (e) {
                    resolve({ ok: false, error: 'Unexpected host response: ' + result });
                }
            });
        });
    }

    /** Serialise a JS value to a quoted ExtendScript string literal. */
    function lit(value) {
        return JSON.stringify(value);
    }

    var host = {
        createComp: function (argsObj) {
            return callHost('createComp', [lit(JSON.stringify(argsObj))]);
        },
        getActiveComp: function () {
            return callHost('getActiveComp', []);
        },
        saveTextFile: function (name, content) {
            return callHost('saveTextFile', [lit(name), lit(content)]);
        },
        openTextFile: function () {
            return callHost('openTextFile', []);
        }
    };

    // ---- rendering --------------------------------------------------------

    function refreshAll() {
        var data = Storage.getData();
        UI.renderProjects(data.projects, Storage.getActiveProjectId());
        refreshPresets();
    }

    function refreshPresets() {
        var proj = Storage.getActiveProject();
        UI.renderPresets(proj ? proj.presets : []);
    }

    function activeProjectId() {
        var p = Storage.getActiveProject();
        return p ? p.id : null;
    }

    function findPreset(presetId) {
        var proj = Storage.getActiveProject();
        if (!proj) { return null; }
        for (var i = 0; i < proj.presets.length; i++) {
            if (proj.presets[i].id === presetId) { return proj.presets[i]; }
        }
        return null;
    }

    function sanitizeFileName(name) {
        return (name || 'CompMaker').replace(/[^\w.-]+/g, '_');
    }

    // ---- comp creation ----------------------------------------------------

    function createCompFromPreset(preset, customName) {
        var args = {
            name: customName || preset.name,
            width: preset.width,
            height: preset.height,
            duration: preset.duration,
            fps: preset.fps,
            backgroundColor: preset.backgroundColor || [0, 0, 0],
            pixelAspect: preset.pixelAspect || 1,
            autoIncrement: !customName
        };
        host.createComp(args).then(function (res) {
            if (res.ok) {
                Storage.recordPresetUse(activeProjectId(), preset.id);
                UI.toast('Created "' + res.name + '"', 'success');
            } else {
                UI.toast(res.error || 'Failed to create composition.', 'error');
            }
        });
    }

    // ---- import -----------------------------------------------------------

    function importFromString(content, sourceLabel) {
        var payload;
        try {
            payload = JSON.parse(content);
        } catch (e) {
            UI.toast('That file is not valid JSON.', 'error');
            return;
        }
        var info = Storage.inspectImport(payload);

        if (info.kind === 'invalid') {
            UI.toast('Unrecognised CompMaker file.', 'error');
            return;
        }

        if (info.kind === 'presets') {
            Storage.importPresets(info.presets, activeProjectId());
            refreshAll();
            UI.toast('Imported ' + info.presets.length + ' preset(s).', 'success');
            return;
        }

        // kind === 'library'
        if (info.existingProjectId) {
            UI.chooseImportMode({
                name: info.project.name,
                onChoose: function (mode) {
                    Storage.importLibrary(info.project, mode, info.existingProjectId);
                    refreshAll();
                    UI.toast('Imported "' + info.project.name + '" (' + mode + ').', 'success');
                }
            });
        } else {
            Storage.importLibrary(info.project, 'copy', null);
            refreshAll();
            UI.toast('Imported project "' + info.project.name + '".', 'success');
        }
    }

    // ---- UI handlers ------------------------------------------------------

    var handlers = {
        onSwitchProject: function (id) {
            Storage.setActiveProject(id);
            refreshPresets();
        },

        onCreateProject: function () {
            UI.prompt({
                title: 'New Project', label: 'Project name', value: 'New Project',
                submitLabel: 'Create', required: true,
                onSubmit: function (name) {
                    Storage.createProject(name);
                    refreshAll();
                    UI.toast('Created project "' + name + '".', 'success');
                }
            });
        },

        onRenameProject: function () {
            var proj = Storage.getActiveProject();
            if (!proj) { return; }
            UI.prompt({
                title: 'Rename Project', label: 'Project name', value: proj.name,
                submitLabel: 'Rename', required: true,
                onSubmit: function (name) {
                    Storage.renameProject(proj.id, name);
                    refreshAll();
                }
            });
        },

        onDuplicateProject: function () {
            var proj = Storage.getActiveProject();
            if (!proj) { return; }
            Storage.duplicateProject(proj.id);
            refreshAll();
            UI.toast('Duplicated "' + proj.name + '".', 'success');
        },

        onDeleteProject: function () {
            var proj = Storage.getActiveProject();
            if (!proj) { return; }
            UI.confirm({
                title: 'Delete Project',
                message: 'Delete "' + proj.name + '" and all its presets? This cannot be undone.',
                confirmLabel: 'Delete', danger: true,
                onConfirm: function () {
                    Storage.deleteProject(proj.id);
                    refreshAll();
                    UI.toast('Project deleted.', 'info');
                }
            });
        },

        onImport: function () {
            host.openTextFile().then(function (res) {
                if (res.cancelled) { return; }
                if (!res.ok) { UI.toast(res.error || 'Import failed.', 'error'); return; }
                importFromString(res.content, res.path);
            });
        },

        onExportProject: function () {
            var proj = Storage.getActiveProject();
            if (!proj) { UI.toast('No project to export.', 'error'); return; }
            var payload = Storage.exportProject(proj.id);
            var fileName = sanitizeFileName(proj.name) + '.compmaker.json';
            host.saveTextFile(fileName, JSON.stringify(payload, null, 2)).then(function (res) {
                if (res.cancelled) { return; }
                if (res.ok) { UI.toast('Exported to ' + res.path, 'success'); }
                else { UI.toast(res.error || 'Export failed.', 'error'); }
            });
        },

        onExportPreset: function (presetId) {
            var preset = findPreset(presetId);
            if (!preset) { return; }
            var payload = Storage.exportPresets(activeProjectId(), [presetId]);
            var fileName = sanitizeFileName(preset.name) + '.compmaker.json';
            host.saveTextFile(fileName, JSON.stringify(payload, null, 2)).then(function (res) {
                if (res.cancelled) { return; }
                if (res.ok) { UI.toast('Exported "' + preset.name + '".', 'success'); }
                else { UI.toast(res.error || 'Export failed.', 'error'); }
            });
        },

        onSettings: function () {
            var env = {};
            try { env = csInterface.getHostEnvironment(); } catch (e) {}
            UI.openSettings({
                version: APP_VERSION,
                host: env.appName ? (env.appName + ' ' + env.appVersion) : 'After Effects',
                dataPath: Storage.getDataFilePath(),
                cardSize: Storage.getSetting('cardSize'),
                onSetCardSize: function (size) {
                    Storage.setSetting('cardSize', size);
                    UI.setCardSize(size);
                    refreshPresets();
                },
                onImport: function () { handlers.onImport(); },
                onExport: function () { handlers.onExportProject(); },
                onReset: function () {
                    UI.confirm({
                        title: 'Reset All Data',
                        message: 'This deletes ALL projects and presets and restores the defaults. Continue?',
                        confirmLabel: 'Reset', danger: true,
                        onConfirm: function () {
                            Storage.resetAll();
                            refreshAll();
                            UI.toast('All data reset.', 'info');
                        }
                    });
                }
            });
        },

        onAddPreset: function () {
            UI.openPresetModal({
                title: 'Add Preset', submitLabel: 'Add Preset',
                onSubmit: function (data) {
                    Storage.addPreset(activeProjectId(), data);
                    refreshPresets();
                    UI.toast('Preset added.', 'success');
                }
            });
        },

        onUseActiveComp: function () {
            host.getActiveComp().then(function (res) {
                if (!res.ok) { UI.toast(res.error || 'No active composition.', 'error'); return; }
                UI.openPresetModal({
                    title: 'Use Active Comp as Preset',
                    submitLabel: 'Save Preset',
                    preset: res.data,
                    onSubmit: function (data) {
                        Storage.addPreset(activeProjectId(), data);
                        refreshPresets();
                        UI.toast('Saved "' + data.name + '" as a preset.', 'success');
                    }
                });
            });
        },

        onPresetClick: function (presetId, shiftKey) {
            var preset = findPreset(presetId);
            if (!preset) { return; }
            if (shiftKey) {
                UI.prompt({
                    title: 'New Composition Name',
                    label: 'Composition name', value: preset.name,
                    submitLabel: 'Create', required: true,
                    onSubmit: function (name) { createCompFromPreset(preset, name); }
                });
            } else {
                createCompFromPreset(preset, null);
            }
        },

        onEditPreset: function (presetId) {
            var preset = findPreset(presetId);
            if (!preset) { return; }
            UI.openPresetModal({
                title: 'Edit Preset', submitLabel: 'Save', preset: preset,
                onSubmit: function (data) {
                    Storage.updatePreset(activeProjectId(), presetId, data);
                    refreshPresets();
                    UI.toast('Preset updated.', 'success');
                }
            });
        },

        onDuplicatePreset: function (presetId) {
            Storage.duplicatePreset(activeProjectId(), presetId);
            refreshPresets();
            UI.toast('Preset duplicated.', 'success');
        },

        onDeletePreset: function (presetId) {
            var preset = findPreset(presetId);
            if (!preset) { return; }
            UI.confirm({
                title: 'Delete Preset',
                message: 'Delete "' + preset.name + '"?',
                confirmLabel: 'Delete', danger: true,
                onConfirm: function () {
                    Storage.deletePreset(activeProjectId(), presetId);
                    refreshPresets();
                    UI.toast('Preset deleted.', 'info');
                }
            });
        }
    };

    // ---- drag & drop import ----------------------------------------------

    function setupDragAndDrop() {
        var fs = null;
        try { if (typeof require === 'function') { fs = require('fs'); } } catch (e) { fs = null; }

        var overlay = document.getElementById('dropOverlay');

        window.addEventListener('dragover', function (e) {
            e.preventDefault();
            if (overlay) { overlay.classList.add('show'); }
        });
        window.addEventListener('dragleave', function (e) {
            if (e.target === document.documentElement || e.clientX <= 0 || e.clientY <= 0) {
                if (overlay) { overlay.classList.remove('show'); }
            }
        });
        window.addEventListener('drop', function (e) {
            e.preventDefault();
            if (overlay) { overlay.classList.remove('show'); }
            var files = e.dataTransfer && e.dataTransfer.files;
            if (!files || !files.length) { return; }
            var path = files[0].path; // available when Node integration is on
            if (path && fs) {
                try {
                    importFromString(fs.readFileSync(path, 'utf8'), path);
                } catch (err) {
                    UI.toast('Could not read dropped file.', 'error');
                }
            } else if (window.FileReader) {
                var reader = new FileReader();
                reader.onload = function () { importFromString(reader.result, files[0].name); };
                reader.readAsText(files[0]);
            }
        });
    }

    // ---- boot -------------------------------------------------------------

    function boot() {
        // Resolve the user-data folder for JSON persistence.
        var userDataPath = '';
        try { userDataPath = csInterface.getSystemPath(SystemPath.USER_DATA); } catch (e) {}

        // Explicitly (re)load the host script so its namespace is guaranteed
        // present, even if ScriptPath auto-load behaviour differs by host.
        try {
            var extPath = csInterface.getSystemPath(SystemPath.EXTENSION);
            var jsxPath = (extPath + '/jsx/host.jsx').replace(/\\/g, '/');
            csInterface.evalScript('$.evalFile(' + JSON.stringify(jsxPath) + ')');
        } catch (e) { /* non-fatal: ScriptPath may already have loaded it */ }

        Storage.init(userDataPath);
        UI.init(handlers);
        UI.setCardSize(Storage.getSetting('cardSize'));
        setupDragAndDrop();
        refreshAll();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();

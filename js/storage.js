/**
 * CompMaker — Storage
 * --------------------------------------------------------------------------
 * Owns the data model and all persistence. No UI, no After Effects.
 *
 * Data lives in a single JSON file under the host's USER_DATA folder
 * (falling back to localStorage if Node's fs is unavailable). The model is
 * intentionally versioned and additive so future features (tags, favorites,
 * thumbnails, multiple libraries, etc.) can be layered on without breaking
 * existing files — readers ignore unknown fields, and `normalize()` fills in
 * any missing ones.
 *
 * Public API is exposed as `window.Storage`.
 */
window.Storage = (function () {
    'use strict';

    var SCHEMA_VERSION = 1;
    var FILE_NAME = 'compmaker-data.json';
    var LS_KEY = 'compmaker.data';

    // Lazily-resolved Node modules (available when --enable-nodejs is set).
    var fs = null;
    var path = null;
    try {
        if (typeof require === 'function') {
            fs = require('fs');
            path = require('path');
        }
    } catch (e) {
        fs = null;
        path = null;
    }

    var dataDir = null;   // resolved on init()
    var dataFile = null;  // resolved on init()
    var cache = null;     // in-memory copy of the data model

    // ---- id + helpers -----------------------------------------------------

    /** Generate a reasonably unique id with a readable prefix. */
    function makeId(prefix) {
        var rand = Math.random().toString(36).slice(2, 8);
        return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + rand;
    }

    /** Shallow clone via JSON (data is plain JSON-safe values). */
    function clone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    // ---- defaults + normalization ----------------------------------------

    /** A brand-new preset object with sane defaults. */
    function defaultPreset(overrides) {
        var p = {
            id: makeId('preset'),
            name: 'New Preset',
            width: 1920,
            height: 1080,
            duration: 10,
            fps: 30,
            backgroundColor: [0, 0, 0],
            pixelAspect: 1,
            // Future-proofing fields (unused today, safe to persist):
            tags: [],
            favorite: false,
            createdAt: Date.now(),
            usageCount: 0,
            metadata: {}
        };
        if (overrides) {
            for (var k in overrides) {
                if (overrides.hasOwnProperty(k)) {
                    p[k] = overrides[k];
                }
            }
        }
        return p;
    }

    /** App-wide defaults (not tied to a project). */
    function defaultSettings() {
        return { cardSize: 'small' };
    }

    /** Seed content shown on very first launch so the panel isn't empty. */
    function seedData() {
        return {
            schemaVersion: SCHEMA_VERSION,
            settings: defaultSettings(),
            projects: [{
                id: makeId('project'),
                name: 'My Project',
                createdAt: Date.now(),
                presets: [
                    defaultPreset({ name: 'Main Screen', width: 3840, height: 2160, duration: 10, fps: 29.97 }),
                    defaultPreset({ name: 'Side Screen', width: 1920, height: 1080, duration: 10, fps: 30 }),
                    defaultPreset({ name: 'Social Vertical', width: 1080, height: 1920, duration: 15, fps: 30 })
                ]
            }],
            activeProject: null
        };
    }

    /** Ensure a loaded object has every required field (forward/backward safe). */
    function normalize(data) {
        if (!data || typeof data !== 'object') {
            data = seedData();
        }
        if (typeof data.schemaVersion !== 'number') {
            data.schemaVersion = SCHEMA_VERSION;
        }
        // Merge settings so files written by older versions gain new defaults.
        var defaults = defaultSettings();
        data.settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
        for (var sk in defaults) {
            if (defaults.hasOwnProperty(sk) && data.settings[sk] === undefined) {
                data.settings[sk] = defaults[sk];
            }
        }
        if (!(data.projects instanceof Array)) {
            data.projects = [];
        }
        data.projects.forEach(function (proj) {
            if (!proj.id) { proj.id = makeId('project'); }
            if (typeof proj.name !== 'string') { proj.name = 'Untitled Project'; }
            if (!(proj.presets instanceof Array)) { proj.presets = []; }
            proj.presets = proj.presets.map(function (preset) {
                // defaultPreset() supplies any field the file lacks.
                return defaultPreset(preset);
            });
        });
        // Make sure activeProject points at something real.
        var hasActive = data.projects.some(function (p) { return p.id === data.activeProject; });
        if (!hasActive) {
            data.activeProject = data.projects.length ? data.projects[0].id : null;
        }
        return data;
    }

    // ---- low-level read / write ------------------------------------------

    function readRaw() {
        if (fs && dataFile) {
            try {
                if (fs.existsSync(dataFile)) {
                    return fs.readFileSync(dataFile, 'utf8');
                }
            } catch (e) { /* fall through */ }
            return null;
        }
        // localStorage fallback
        try {
            return window.localStorage.getItem(LS_KEY);
        } catch (e) {
            return null;
        }
    }

    function writeRaw(str) {
        if (fs && dataDir && dataFile) {
            try {
                if (!fs.existsSync(dataDir)) {
                    fs.mkdirSync(dataDir, { recursive: true });
                }
                fs.writeFileSync(dataFile, str, 'utf8');
                return true;
            } catch (e) {
                // fall through to localStorage as a last resort
            }
        }
        try {
            window.localStorage.setItem(LS_KEY, str);
            return true;
        } catch (e) {
            return false;
        }
    }

    // ---- public API -------------------------------------------------------

    /**
     * Initialise storage. Resolves the data path (using the CEP user-data
     * folder when possible) and loads — or seeds — the data file.
     * @param {string} [userDataPath] Native path to the host user-data dir.
     */
    function init(userDataPath) {
        if (fs && path && userDataPath) {
            dataDir = path.join(userDataPath, 'CompMaker');
            dataFile = path.join(dataDir, FILE_NAME);
        }
        var raw = readRaw();
        if (raw) {
            try {
                cache = normalize(JSON.parse(raw));
            } catch (e) {
                cache = normalize(seedData());
            }
        } else {
            cache = normalize(seedData());
            persist();
        }
        return cache;
    }

    /** Write the in-memory model to disk. @returns {boolean} success */
    function persist() {
        if (!cache) { return false; }
        return writeRaw(JSON.stringify(cache, null, 2));
    }

    /** @returns {string|null} Path of the data file (for the Settings panel). */
    function getDataFilePath() {
        return dataFile || ('localStorage:' + LS_KEY);
    }

    /** @returns {object} The full (live) data model. */
    function getData() {
        return cache;
    }

    /** Read an app-wide setting (e.g. 'cardSize'). */
    function getSetting(key) {
        return cache.settings ? cache.settings[key] : undefined;
    }

    /** Write an app-wide setting and persist. */
    function setSetting(key, value) {
        if (!cache.settings) { cache.settings = {}; }
        cache.settings[key] = value;
        persist();
        return value;
    }

    function getProjects() {
        return cache.projects;
    }

    function getProject(id) {
        for (var i = 0; i < cache.projects.length; i++) {
            if (cache.projects[i].id === id) { return cache.projects[i]; }
        }
        return null;
    }

    function getActiveProjectId() {
        return cache.activeProject;
    }

    function getActiveProject() {
        return getProject(cache.activeProject) ||
            (cache.projects.length ? cache.projects[0] : null);
    }

    function setActiveProject(id) {
        if (getProject(id)) {
            cache.activeProject = id;
            persist();
        }
        return getActiveProject();
    }

    // ---- project CRUD -----------------------------------------------------

    function createProject(name) {
        var proj = {
            id: makeId('project'),
            name: name || 'New Project',
            createdAt: Date.now(),
            presets: []
        };
        cache.projects.push(proj);
        cache.activeProject = proj.id;
        persist();
        return proj;
    }

    function renameProject(id, name) {
        var proj = getProject(id);
        if (proj) {
            proj.name = name;
            persist();
        }
        return proj;
    }

    function duplicateProject(id) {
        var proj = getProject(id);
        if (!proj) { return null; }
        var copy = clone(proj);
        copy.id = makeId('project');
        copy.name = proj.name + ' Copy';
        copy.createdAt = Date.now();
        // Fresh ids for all presets so they stay independent.
        copy.presets.forEach(function (p) { p.id = makeId('preset'); });
        cache.projects.push(copy);
        cache.activeProject = copy.id;
        persist();
        return copy;
    }

    function deleteProject(id) {
        cache.projects = cache.projects.filter(function (p) { return p.id !== id; });
        if (cache.activeProject === id) {
            cache.activeProject = cache.projects.length ? cache.projects[0].id : null;
        }
        persist();
        return getActiveProject();
    }

    // ---- preset CRUD ------------------------------------------------------

    function addPreset(projectId, presetData) {
        var proj = getProject(projectId);
        if (!proj) { return null; }
        var preset = defaultPreset(presetData);
        preset.id = makeId('preset'); // never trust an incoming id
        proj.presets.push(preset);
        persist();
        return preset;
    }

    function updatePreset(projectId, presetId, presetData) {
        var proj = getProject(projectId);
        if (!proj) { return null; }
        for (var i = 0; i < proj.presets.length; i++) {
            if (proj.presets[i].id === presetId) {
                var merged = defaultPreset(proj.presets[i]);
                for (var k in presetData) {
                    if (presetData.hasOwnProperty(k) && k !== 'id') {
                        merged[k] = presetData[k];
                    }
                }
                merged.id = presetId;
                proj.presets[i] = merged;
                persist();
                return merged;
            }
        }
        return null;
    }

    function duplicatePreset(projectId, presetId) {
        var proj = getProject(projectId);
        if (!proj) { return null; }
        for (var i = 0; i < proj.presets.length; i++) {
            if (proj.presets[i].id === presetId) {
                var copy = defaultPreset(clone(proj.presets[i]));
                copy.id = makeId('preset');
                copy.name = proj.presets[i].name + ' Copy';
                copy.createdAt = Date.now();
                proj.presets.splice(i + 1, 0, copy);
                persist();
                return copy;
            }
        }
        return null;
    }

    function deletePreset(projectId, presetId) {
        var proj = getProject(projectId);
        if (!proj) { return false; }
        proj.presets = proj.presets.filter(function (p) { return p.id !== presetId; });
        persist();
        return true;
    }

    /** Record a preset use (powers future "recently used" / stats features). */
    function recordPresetUse(projectId, presetId) {
        var proj = getProject(projectId);
        if (!proj) { return; }
        proj.presets.forEach(function (p) {
            if (p.id === presetId) {
                p.usageCount = (p.usageCount || 0) + 1;
                p.lastUsedAt = Date.now();
            }
        });
        persist();
    }

    // ---- import / export --------------------------------------------------

    /** Serialise a whole project to a shareable library object. */
    function exportProject(projectId) {
        var proj = getProject(projectId);
        if (!proj) { return null; }
        return {
            type: 'compmaker-library',
            schemaVersion: SCHEMA_VERSION,
            exportedAt: Date.now(),
            project: clone(proj)
        };
    }

    /** Serialise one or more presets (without a project) for sharing. */
    function exportPresets(projectId, presetIds) {
        var proj = getProject(projectId);
        if (!proj) { return null; }
        var picked = proj.presets.filter(function (p) {
            return presetIds.indexOf(p.id) !== -1;
        });
        return {
            type: 'compmaker-presets',
            schemaVersion: SCHEMA_VERSION,
            exportedAt: Date.now(),
            presets: clone(picked)
        };
    }

    /**
     * Inspect an imported payload without committing it.
     * @returns {object} { kind:'library'|'presets'|'invalid', project?, presets?,
     *                      existingProjectId? }
     */
    function inspectImport(payload) {
        if (!payload || typeof payload !== 'object') {
            return { kind: 'invalid' };
        }
        if (payload.type === 'compmaker-library' && payload.project) {
            var match = null;
            cache.projects.forEach(function (p) {
                if (p.name === payload.project.name) { match = p.id; }
            });
            return { kind: 'library', project: payload.project, existingProjectId: match };
        }
        if (payload.type === 'compmaker-presets' && payload.presets instanceof Array) {
            return { kind: 'presets', presets: payload.presets };
        }
        // Be lenient: a bare project object is still importable.
        if (payload.project && payload.project.presets) {
            return { kind: 'library', project: payload.project, existingProjectId: null };
        }
        return { kind: 'invalid' };
    }

    /**
     * Import a library project.
     * @param {object} project Source project from the payload.
     * @param {string} mode 'replace' | 'merge' | 'copy'
     * @param {string} [existingProjectId] Target project for replace/merge.
     * @returns {object} The resulting (now active) project.
     */
    function importLibrary(project, mode, existingProjectId) {
        var incoming = clone(project);

        if (mode === 'replace' && existingProjectId) {
            var target = getProject(existingProjectId);
            if (target) {
                target.name = incoming.name;
                target.presets = incoming.presets.map(function (p) {
                    p.id = makeId('preset');
                    return defaultPreset(p);
                });
                cache.activeProject = target.id;
                persist();
                return target;
            }
        }

        if (mode === 'merge' && existingProjectId) {
            var mergeTarget = getProject(existingProjectId);
            if (mergeTarget) {
                incoming.presets.forEach(function (p) {
                    p.id = makeId('preset');
                    mergeTarget.presets.push(defaultPreset(p));
                });
                cache.activeProject = mergeTarget.id;
                persist();
                return mergeTarget;
            }
        }

        // 'copy' (or no existing match): create a fresh project.
        var newProj = {
            id: makeId('project'),
            name: existingProjectId ? incoming.name + ' Copy' : incoming.name,
            createdAt: Date.now(),
            presets: incoming.presets.map(function (p) {
                p.id = makeId('preset');
                return defaultPreset(p);
            })
        };
        cache.projects.push(newProj);
        cache.activeProject = newProj.id;
        persist();
        return newProj;
    }

    /** Import loose presets into the active (or given) project. */
    function importPresets(presets, projectId) {
        var proj = getProject(projectId) || getActiveProject();
        if (!proj) {
            proj = createProject('Imported Presets');
        }
        presets.forEach(function (p) {
            var preset = defaultPreset(p);
            preset.id = makeId('preset');
            proj.presets.push(preset);
        });
        cache.activeProject = proj.id;
        persist();
        return proj;
    }

    /** Wipe everything and re-seed (used by Settings → Reset). */
    function resetAll() {
        cache = normalize(seedData());
        persist();
        return cache;
    }

    return {
        SCHEMA_VERSION: SCHEMA_VERSION,
        init: init,
        persist: persist,
        getDataFilePath: getDataFilePath,
        getData: getData,
        getSetting: getSetting,
        setSetting: setSetting,
        getProjects: getProjects,
        getProject: getProject,
        getActiveProjectId: getActiveProjectId,
        getActiveProject: getActiveProject,
        setActiveProject: setActiveProject,
        createProject: createProject,
        renameProject: renameProject,
        duplicateProject: duplicateProject,
        deleteProject: deleteProject,
        addPreset: addPreset,
        updatePreset: updatePreset,
        duplicatePreset: duplicatePreset,
        deletePreset: deletePreset,
        recordPresetUse: recordPresetUse,
        exportProject: exportProject,
        exportPresets: exportPresets,
        inspectImport: inspectImport,
        importLibrary: importLibrary,
        importPresets: importPresets,
        resetAll: resetAll,
        makeId: makeId
    };
})();

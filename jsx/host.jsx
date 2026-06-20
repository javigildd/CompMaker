/**
 * CompMaker — ExtendScript host (After Effects)
 * --------------------------------------------------------------------------
 * This file holds ALL After Effects logic. The panel (JavaScript / CEP) never
 * touches the AE DOM directly; it calls these functions via evalScript and
 * exchanges data as JSON strings. Every entry point returns a JSON string of
 * the shape { ok: Boolean, ... } so the panel can handle errors uniformly.
 *
 * Keep this file ES3-compatible (no const/let, arrow functions, JSON spread):
 * ExtendScript is an old ECMAScript dialect.
 */

// A namespace object avoids polluting the global ExtendScript scope.
var CompMaker = (function () {
    'use strict';

    /** Zero-pad a number to at least two digits: 1 -> "01", 12 -> "12". */
    function pad(n) {
        n = String(n);
        while (n.length < 2) {
            n = '0' + n;
        }
        return n;
    }

    /**
     * Find a unique, auto-incremented comp name for a base name.
     * Scans existing project comps matching `base` or `base_NN` and returns
     * `base_(highest+1)`. First comp for a base becomes `base_01`.
     * @param {string} base
     * @returns {string}
     */
    function uniqueIncrementName(base) {
        var highest = 0;
        // Escape regex metacharacters in the user-provided base name.
        var safe = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var re = new RegExp('^' + safe + '(?:_(\\d+))?$');
        var i, item, m, num;
        for (i = 1; i <= app.project.numItems; i++) {
            item = app.project.item(i);
            if (item instanceof CompItem) {
                m = re.exec(item.name);
                if (m) {
                    num = m[1] ? parseInt(m[1], 10) : 0;
                    if (num > highest) {
                        highest = num;
                    }
                }
            }
        }
        return base + '_' + pad(highest + 1);
    }

    /**
     * Create a composition from preset settings.
     * @param {string} argsJson JSON: { name, width, height, duration, fps,
     *        backgroundColor:[r,g,b] (0-255), pixelAspect?, autoIncrement? }
     * @returns {string} JSON { ok, name } or { ok:false, error }
     */
    function createComp(argsJson) {
        try {
            var a = JSON.parse(argsJson);
            var width = Math.max(1, Math.round(a.width));
            var height = Math.max(1, Math.round(a.height));
            var pixelAspect = a.pixelAspect ? Number(a.pixelAspect) : 1;
            var duration = Number(a.duration);
            var fps = Number(a.fps);
            var bg = a.backgroundColor || [0, 0, 0];

            var name = a.autoIncrement ? uniqueIncrementName(a.name) : a.name;

            app.beginUndoGroup('CompMaker: Create "' + name + '"');
            var comp = app.project.items.addComp(
                name, width, height, pixelAspect, duration, fps
            );
            // AE expects background color as floats 0..1.
            comp.bgColor = [bg[0] / 255, bg[1] / 255, bg[2] / 255];
            comp.openInViewer();
            app.endUndoGroup();

            return JSON.stringify({ ok: true, name: comp.name });
        } catch (e) {
            try { app.endUndoGroup(); } catch (ignore) {}
            return JSON.stringify({ ok: false, error: e.toString() });
        }
    }

    /**
     * Read the currently active composition's settings.
     * @returns {string} JSON { ok, data } or { ok:false, error }
     */
    function getActiveComp() {
        try {
            var item = app.project ? app.project.activeItem : null;
            if (!item || !(item instanceof CompItem)) {
                return JSON.stringify({
                    ok: false,
                    error: 'No active composition. Select or open a comp first.'
                });
            }
            var bg = item.bgColor;
            return JSON.stringify({
                ok: true,
                data: {
                    name: item.name,
                    width: item.width,
                    height: item.height,
                    duration: item.duration,
                    fps: item.frameRate,
                    pixelAspect: item.pixelAspect,
                    backgroundColor: [
                        Math.round(bg[0] * 255),
                        Math.round(bg[1] * 255),
                        Math.round(bg[2] * 255)
                    ]
                }
            });
        } catch (e) {
            return JSON.stringify({ ok: false, error: e.toString() });
        }
    }

    /**
     * Show a native Save dialog and write text content to the chosen file.
     * @param {string} suggestedName Default file name.
     * @param {string} content       Text to write (UTF-8).
     * @returns {string} JSON { ok, path } | { ok:false, cancelled? , error? }
     */
    function saveTextFile(suggestedName, content) {
        try {
            var f = File.saveDialog('Export CompMaker presets', suggestedName);
            if (!f) {
                return JSON.stringify({ ok: false, cancelled: true });
            }
            f.encoding = 'UTF-8';
            if (!f.open('w')) {
                return JSON.stringify({ ok: false, error: 'Could not open file for writing.' });
            }
            f.write(content);
            f.close();
            return JSON.stringify({ ok: true, path: f.fsName });
        } catch (e) {
            return JSON.stringify({ ok: false, error: e.toString() });
        }
    }

    /**
     * Show a native Open dialog and return the chosen file's text content.
     * @returns {string} JSON { ok, path, content } | { ok:false, cancelled?, error? }
     */
    function openTextFile() {
        try {
            var f = File.openDialog('Import CompMaker presets', '*.json;*.compmaker.json', false);
            if (!f) {
                return JSON.stringify({ ok: false, cancelled: true });
            }
            f.encoding = 'UTF-8';
            if (!f.open('r')) {
                return JSON.stringify({ ok: false, error: 'Could not open file for reading.' });
            }
            var content = f.read();
            f.close();
            return JSON.stringify({ ok: true, path: f.fsName, content: content });
        } catch (e) {
            return JSON.stringify({ ok: false, error: e.toString() });
        }
    }

    return {
        createComp: createComp,
        getActiveComp: getActiveComp,
        saveTextFile: saveTextFile,
        openTextFile: openTextFile
    };
})();

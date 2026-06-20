/*
 * CSInterface — minimal, dependency-free subset of Adobe's official CEP
 * CSInterface.js, covering only the APIs CompMaker uses:
 *   - evalScript()        run ExtendScript in the host (After Effects)
 *   - getSystemPath()     resolve well-known folders (e.g. user data)
 *   - getOSInformation()  detect Mac vs. Windows
 *   - getHostEnvironment()/getApplicationID()
 *   - addEventListener()/dispatchEvent() for CEP events
 *
 * It talks to the host through the injected `window.__adobe_cep__` bridge,
 * exactly like the full library does, so it is a drop-in for our needs.
 */
(function (global) {
    'use strict';

    /** Well-known system path identifiers understood by the CEP host. */
    function SystemPath() {}
    SystemPath.USER_DATA = 'userData';
    SystemPath.COMMON_FILES = 'commonFiles';
    SystemPath.MY_DOCUMENTS = 'myDocuments';
    SystemPath.APPLICATION = 'application';
    SystemPath.EXTENSION = 'extension';
    SystemPath.HOST_APPLICATION = 'hostApplication';

    /** A CEP event used for dispatchEvent(). */
    function CSEvent(type, scope, appId, extensionId) {
        this.type = type;
        this.scope = scope || 'APPLICATION';
        this.appId = appId;
        this.extensionId = extensionId;
        this.data = '';
    }

    function CSInterface() {}

    /**
     * Run an ExtendScript string in the host application.
     * @param {string} script   ExtendScript source to evaluate.
     * @param {function} [callback] Receives the string result (or 'EvalScript error.').
     */
    CSInterface.prototype.evalScript = function (script, callback) {
        if (typeof callback !== 'function') {
            callback = function () {};
        }
        global.__adobe_cep__.evalScript(script, callback);
    };

    /** @returns {string} Raw OS string, e.g. "Mac OS X 10.15" or "Windows 10". */
    CSInterface.prototype.getOSInformation = function () {
        var platform = (global.navigator && global.navigator.platform) || '';
        if (/win/i.test(platform)) {
            return 'Windows';
        }
        if (/mac/i.test(platform)) {
            return 'Mac OS X';
        }
        return platform || 'Unknown';
    };

    /**
     * Resolve a well-known folder to a native filesystem path.
     * @param {string} pathType One of the SystemPath constants.
     * @returns {string} Native path (file:// scheme stripped).
     */
    CSInterface.prototype.getSystemPath = function (pathType) {
        var path = decodeURI(global.__adobe_cep__.getSystemPath(pathType));
        var os = this.getOSInformation();
        if (os.indexOf('Windows') >= 0) {
            path = path.replace('file:///', '');
        } else if (os.indexOf('Mac') >= 0) {
            path = path.replace('file://', '');
        }
        return path;
    };

    /** @returns {object} Parsed host environment (appName, appVersion, etc.). */
    CSInterface.prototype.getHostEnvironment = function () {
        try {
            return JSON.parse(global.__adobe_cep__.getHostEnvironment());
        } catch (e) {
            return {};
        }
    };

    /** @returns {string} The host application id, e.g. "AEFT". */
    CSInterface.prototype.getApplicationID = function () {
        var env = this.getHostEnvironment();
        return env.appId || '';
    };

    /** Subscribe to a CEP event. */
    CSInterface.prototype.addEventListener = function (type, listener, obj) {
        global.__adobe_cep__.addEventListener(type, listener, obj);
    };

    /** Unsubscribe from a CEP event. */
    CSInterface.prototype.removeEventListener = function (type, listener, obj) {
        global.__adobe_cep__.removeEventListener(type, listener, obj);
    };

    /** Dispatch a CEP event to the host or other extensions. */
    CSInterface.prototype.dispatchEvent = function (event) {
        if (typeof event.data === 'object') {
            event.data = JSON.stringify(event.data);
        }
        global.__adobe_cep__.dispatchEvent(event);
    };

    /** Ask the host to flush its persistent resource bundle cache (no-op fallback). */
    CSInterface.prototype.requestOpenExtension = function (extensionId, params) {
        global.__adobe_cep__.requestOpenExtension(extensionId, params);
    };

    // Export
    global.SystemPath = SystemPath;
    global.CSEvent = CSEvent;
    global.CSInterface = CSInterface;
})(this);

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.esc = esc;
// The one HTML escape used by every webview builder. No vscode dependency.
// Note: `'` is NOT escaped — keep attribute values double-quoted.
function esc(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
//# sourceMappingURL=escape.js.map
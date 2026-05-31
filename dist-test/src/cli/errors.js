"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CliError = void 0;
// No vscode dependency — safe to import in unit tests.
class CliError extends Error {
    constructor(message, diagnostics, command) {
        super(message);
        this.diagnostics = diagnostics;
        this.command = command;
        this.name = "CliError";
    }
}
exports.CliError = CliError;
//# sourceMappingURL=errors.js.map
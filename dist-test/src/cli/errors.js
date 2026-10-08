"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CliError = void 0;
// No vscode dependency — safe to import in unit tests.
class CliError extends Error {
    constructor(message, diagnostics, command, 
    // Structured reports aligned with `diagnostics` (ADR-053, srs-rust#1338).
    // Empty when the envelope predates that contract or none were parsed
    // (e.g. a spawn/stderr-fallback failure with no envelope at all).
    errors = []) {
        super(message);
        this.diagnostics = diagnostics;
        this.command = command;
        this.errors = errors;
        this.name = "CliError";
    }
    /** True when any structured error report carries the given stable `code`. */
    hasErrorCode(code) {
        return this.errors.some((e) => e.code === code);
    }
}
exports.CliError = CliError;
//# sourceMappingURL=errors.js.map
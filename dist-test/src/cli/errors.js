"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CliError = void 0;
// No vscode dependency — safe to import in unit tests.
class CliError extends Error {
    constructor(message, diagnostics, command, 
    // Structured errors aligned 1:1 with `diagnostics` (srs-rust ADR-053), when the
    // envelope carried them. Absent for client-side failures (spawn errors, non-JSON
    // output) that never reached the CLI's envelope encoder.
    errors) {
        super(message);
        this.diagnostics = diagnostics;
        this.command = command;
        this.errors = errors;
        this.name = "CliError";
    }
}
exports.CliError = CliError;
//# sourceMappingURL=errors.js.map
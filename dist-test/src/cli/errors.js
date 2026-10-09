"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CliError = void 0;
exports.hasErrorCode = hasErrorCode;
// No vscode dependency — safe to import in unit tests.
class CliError extends Error {
    constructor(message, diagnostics, command, errors) {
        super(message);
        this.diagnostics = diagnostics;
        this.command = command;
        this.errors = errors;
        this.name = "CliError";
    }
}
exports.CliError = CliError;
// Branch on the structured ADR-053 error code, never on message/diagnostics text
// (ADR-048 rule 6: identifier over label) — Display text is prose and carries no
// stability guarantee across srs-rust releases.
function hasErrorCode(err, code) {
    return err instanceof CliError && (err.errors?.some((e) => e.code === code) ?? false);
}
//# sourceMappingURL=errors.js.map
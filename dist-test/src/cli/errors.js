"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CliError = void 0;
exports.isCannotDeleteInUse = isCannotDeleteInUse;
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
// True when the CLI reported the structured `cannot-delete-in-use` code (ADR-053,
// srs-rust#1338) — i.e. the entity still has a reference pointing at it and the engine
// refused the delete. `errors[]` is absent on an older CLI build; that's treated as "no",
// not a match, so callers fall back to the generic failure message instead of guessing.
function isCannotDeleteInUse(err) {
    return (err.errors ?? []).some((e) => e.code === "cannot-delete-in-use");
}
//# sourceMappingURL=errors.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CliError = void 0;
exports.parseEnvelope = parseEnvelope;
exports.buildArgv = buildArgv;
exports.buildRawArgv = buildRawArgv;
const errors_1 = require("./errors");
var errors_2 = require("./errors");
Object.defineProperty(exports, "CliError", { enumerable: true, get: function () { return errors_2.CliError; } });
function parseEnvelope(stdout, commandHint) {
    const trimmed = stdout.trim();
    if (!trimmed) {
        throw new errors_1.CliError("srs produced no output", ["Empty stdout"], commandHint);
    }
    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    }
    catch {
        throw new errors_1.CliError(`srs output is not valid JSON: ${trimmed.slice(0, 200)}`, ["Non-JSON stdout"], commandHint);
    }
    if (typeof parsed !== "object" ||
        parsed === null ||
        typeof parsed["ok"] !== "boolean") {
        throw new errors_1.CliError("srs envelope missing 'ok' field", ["Malformed envelope"], commandHint);
    }
    return parsed;
}
function buildArgv(repoPath, subcommandArgs, options) {
    const args = ["--repo", repoPath, "--format", "json"];
    if (options?.pretty) {
        args.push("--pretty");
    }
    if (options?.containerId) {
        args.push("--container", options.containerId);
    }
    args.push(...subcommandArgs);
    return args;
}
// Build argv WITHOUT injecting --repo. For the few commands that operate on a
// file path directly rather than on a loaded repository — notably
// `srs archive unpack <source>.srs --target <dir>`, which takes its source and
// target as arguments and never resolves the ambient --repo. --format json is
// still prepended so the output is a parseable envelope. --container is omitted
// (these commands have no container scope).
function buildRawArgv(subcommandArgs, options) {
    const args = ["--format", "json"];
    if (options?.pretty) {
        args.push("--pretty");
    }
    args.push(...subcommandArgs);
    return args;
}
//# sourceMappingURL=envelope.js.map
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CliClient = exports.buildRawArgv = exports.buildArgv = exports.parseEnvelope = exports.CliError = void 0;
const cp = __importStar(require("child_process"));
const vscode = __importStar(require("vscode"));
const errors_1 = require("./errors");
const envelope_1 = require("./envelope");
var errors_2 = require("./errors");
Object.defineProperty(exports, "CliError", { enumerable: true, get: function () { return errors_2.CliError; } });
var envelope_2 = require("./envelope");
Object.defineProperty(exports, "parseEnvelope", { enumerable: true, get: function () { return envelope_2.parseEnvelope; } });
Object.defineProperty(exports, "buildArgv", { enumerable: true, get: function () { return envelope_2.buildArgv; } });
Object.defineProperty(exports, "buildRawArgv", { enumerable: true, get: function () { return envelope_2.buildRawArgv; } });
class CliClient {
    constructor(outputChannel) {
        this.outputChannel = outputChannel;
    }
    get binaryPath() {
        return vscode.workspace
            .getConfiguration("srs")
            .get("cli.path", "srs");
    }
    get tracing() {
        return vscode.workspace
            .getConfiguration("srs")
            .get("trace.cli", false);
    }
    // Run a CLI command and return the raw envelope (ok:true or ok:false).
    async run(repoPath, subcommandArgs, options) {
        return this._exec((0, envelope_1.buildArgv)(repoPath, subcommandArgs, options), subcommandArgs[0] ?? "unknown", options);
    }
    // Run a command WITHOUT injecting --repo (buildRawArgv). For commands that take
    // file paths as arguments rather than a loaded repo — e.g. `archive unpack`.
    async runRaw(subcommandArgs, options) {
        return this._exec((0, envelope_1.buildRawArgv)(subcommandArgs, options), subcommandArgs[0] ?? "unknown", options);
    }
    // Spawn the srs binary with a fully-built argv and parse the JSON envelope.
    async _exec(args, commandHint, options) {
        const binary = this.binaryPath;
        if (this.tracing) {
            this.outputChannel.appendLine(`[srs] ${binary} ${args.join(" ")}`);
        }
        return new Promise((resolve, reject) => {
            let proc;
            try {
                proc = cp.spawn(binary, args, { stdio: ["pipe", "pipe", "pipe"] });
            }
            catch (err) {
                reject(new errors_1.CliError(`Failed to spawn srs binary '${binary}'. Check srs.cli.path in settings.`, [`Spawn error: ${String(err)}`], commandHint));
                return;
            }
            let stdout = "";
            let stderr = "";
            proc.stdout.on("data", (d) => {
                stdout += d.toString();
            });
            proc.stderr.on("data", (d) => {
                stderr += d.toString();
            });
            if (options?.stdin) {
                proc.stdin.write(options.stdin);
            }
            proc.stdin.end();
            proc.on("error", (err) => {
                if (err.code === "ENOENT") {
                    reject(new errors_1.CliError(`srs binary not found at '${binary}'. Install srs and set srs.cli.path in settings.`, [`Binary not found: ${binary}`], commandHint));
                }
                else {
                    reject(new errors_1.CliError(`srs process error: ${err.message}`, [err.message], commandHint));
                }
            });
            proc.on("close", () => {
                if (this.tracing && stdout) {
                    this.outputChannel.appendLine(`[srs stdout] ${stdout.slice(0, 2000)}`);
                }
                if (stderr) {
                    this.outputChannel.appendLine(`[srs stderr] ${stderr}`);
                }
                try {
                    resolve((0, envelope_1.parseEnvelope)(stdout, commandHint));
                }
                catch (err) {
                    reject(err);
                }
            });
        });
    }
    // Run and assert ok:true; throw CliError on ok:false.
    async runOk(repoPath, subcommandArgs, options) {
        return CliClient._assertOk(await this.run(repoPath, subcommandArgs, options), subcommandArgs);
    }
    // runRaw + assert ok:true; throw CliError on ok:false.
    async runRawOk(subcommandArgs, options) {
        return CliClient._assertOk(await this.runRaw(subcommandArgs, options), subcommandArgs);
    }
    static _assertOk(envelope, subcommandArgs) {
        if (!envelope.ok) {
            throw new errors_1.CliError(`srs ${subcommandArgs.join(" ")} failed: ${envelope.diagnostics.join("; ")}`, envelope.diagnostics, subcommandArgs[0] ?? "unknown");
        }
        return envelope.payload;
    }
}
exports.CliClient = CliClient;
//# sourceMappingURL=CliClient.js.map
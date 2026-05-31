// Intercept require('vscode') and return the compiled mock.
// Must be loaded before any test file via --require.
const Module = require("module");
const path = require("path");

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "vscode") {
    return path.resolve(
      __dirname,
      "../../dist-test/test/fixtures/vscode-mock.js",
    );
  }
  return originalResolve.call(this, request, ...rest);
};

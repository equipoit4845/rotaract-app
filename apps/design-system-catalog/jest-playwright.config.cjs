// CommonJS on purpose (this package is "type": "module") — jest-playwright's
// config loader expects this shape. `--no-sandbox` is required for Chromium
// to launch in this project's sandboxed CI/dev containers.
module.exports = {
  launchOptions: {
    args: ["--no-sandbox"],
  },
};

import { spawn } from "node:child_process";

import { CliError } from "./errors.js";

/**
 * Runs a program without a shell. `capture: true` collects stdout (stderr
 * is still streamed to `stderr` unless `quiet`), otherwise both are
 * inherited so long builds show progress.
 *
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
export function run(command, args, options = {}) {
  const {
    capture = false,
    quiet = false,
    env,
    cwd,
    stderr = process.stderr,
  } = options;
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env: env ? { ...process.env, ...env } : process.env,
        stdio:
          capture || quiet
            ? ["ignore", "pipe", "pipe"]
            : ["ignore", "inherit", "inherit"],
      });
    } catch (error) {
      reject(error);
      return;
    }
    let out = "";
    let err = "";
    child.stdout?.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      err += chunk;
      if (!quiet) stderr.write(chunk);
    });
    child.on("error", (error) => {
      if (error.code === "ENOENT")
        reject(
          new CliError(`No encontré el programa "${command}".`, {
            hint:
              command === "docker"
                ? "Instalá Docker (con el plugin compose v2) y asegurate de que `docker` esté en el PATH."
                : undefined,
          }),
        );
      else reject(error);
    });
    child.on("close", (code) =>
      resolve({ code: code ?? 1, stdout: out, stderr: err }),
    );
  });
}

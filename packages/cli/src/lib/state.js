import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** ~/.mirotaract (or MIROTARACT_HOME): state of the local kernel. */
export function homeDir(env = process.env) {
  return env.MIROTARACT_HOME || join(homedir(), ".mirotaract");
}

export function devDir(env = process.env) {
  return join(homeDir(env), "dev");
}

export function loadState(env = process.env) {
  const path = join(devDir(env), "state.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function saveState(state, env = process.env) {
  const dir = devDir(env);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(
    join(dir, "state.json"),
    `${JSON.stringify(state, null, 2)}\n`,
    {
      mode: 0o600,
    },
  );
}

/**
 * Secrets of the disposable stack. Generated once and kept, so restarting
 * the stack doesn't invalidate sessions or signing keys stored in its DB.
 */
export function ensureSecrets(state) {
  const secret = () => randomBytes(32).toString("base64url");
  return {
    dbPassword: state?.secrets?.dbPassword ?? secret(),
    jwtSecret: state?.secrets?.jwtSecret ?? secret(),
    signingKeySecret: state?.secrets?.signingKeySecret ?? secret(),
  };
}

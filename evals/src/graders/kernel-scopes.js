/**
 * Against a local kernel (MIROTARACT_EVAL_KERNEL_URL=http://localhost:54321/api/kernel/v1,
 * i.e. `mirotaract dev up`): registers a sandbox app with exactly the scopes
 * the solution requests and gets a token with them. Proves the scopes exist
 * and are grantable together; skipped when no local kernel is configured.
 */
import { isLocalKernel, Sandbox } from "@mirotaract/mcp/sandbox";

import { extractScopes } from "./minimal-scopes.js";
import { fail, pass, skip } from "./result.js";

export default {
  id: "kernel-scopes",
  title: "Los scopes pedidos funcionan contra el kernel local",
  critical: false,
  async grade({ solution, env = process.env }) {
    const baseUrl = env.MIROTARACT_EVAL_KERNEL_URL;
    if (!baseUrl) return skip("Sin kernel local (MIROTARACT_EVAL_KERNEL_URL); corré `mirotaract dev up` para habilitarlo.");
    if (!isLocalKernel(baseUrl)) return skip(`${baseUrl} no es local: los evals nunca tocan un kernel real.`);
    const { oidc, service } = extractScopes(solution);
    const sandbox = new Sandbox({ baseUrl });
    const details = [];
    try {
      if (service.length) {
        await sandbox.createTestApp({ name: "Eval: scopes de servicio", scopes: service, grantTypes: ["client_credentials"] });
        const token = await sandbox.issueTestToken({ scope: service });
        details.push(`Token de servicio emitido con: ${token.scope}`);
      }
      if (oidc.length) {
        const app = await sandbox.createTestApp({ name: "Eval: login", type: "PUBLIC", scopes: oidc, grantTypes: ["authorization_code"], redirectUris: ["http://localhost:3000/auth/callback"] });
        details.push(`App de login registrada con: ${app.app.scopes.join(" ")}`);
      }
    } catch (error) {
      return fail(`El kernel local rechazó los scopes (${[...oidc, ...service].join(" ")}): ${error.message}`);
    }
    if (!details.length) return skip("La solución no pide scopes.");
    return pass(details);
  },
};

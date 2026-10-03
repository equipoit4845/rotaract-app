import jwksVerification from "./jwks-verification.js";
import kernelScopes from "./kernel-scopes.js";
import manifestValid from "./manifest-valid.js";
import minimalScopes from "./minimal-scopes.js";
import noClientSecrets from "./no-client-secrets.js";
import noPiiLogs from "./no-pii-logs.js";
import noWebStorageTokens from "./no-web-storage-tokens.js";
import pagination from "./pagination.js";
import webhookIdempotency from "./webhook-idempotency.js";
import webhookRuntime from "./webhook-runtime.js";
import webhookSignature from "./webhook-signature.js";

export const GRADERS = Object.fromEntries(
  [
    noWebStorageTokens,
    jwksVerification,
    minimalScopes,
    noClientSecrets,
    webhookSignature,
    webhookIdempotency,
    webhookRuntime,
    noPiiLogs,
    pagination,
    manifestValid,
    kernelScopes,
  ].map((g) => [g.id, g]),
);

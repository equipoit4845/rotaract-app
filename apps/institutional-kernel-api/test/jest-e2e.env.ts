// Defaults for running against `docker compose up -d postgres redis nats`
// from the host: the in-container hostnames (postgres/redis/nats) only
// resolve inside the compose network, so these point at localhost's
// published ports instead. Never overrides a value the environment
// already set (CI can point these elsewhere).
process.env.KERNEL_DATABASE_URL ??=
  "postgresql://kernel:kernel_dev_only@localhost:5432/institutional_kernel?schema=public";
process.env.JWT_SECRET ??= "e2e-test-secret-not-for-production";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.NATS_URL ??= "nats://localhost:4222";
process.env.KERNEL_JOBS_ENABLED ??= "false";
process.env.CLICKMAIL_API_KEY ??= "";
// Every E2E request goes through the OpenAPI request validator.  Response
// validation is exercised in its dedicated contract test to retain useful
// application-level failure diagnostics in the rest of the suite.
process.env.KERNEL_OPENAPI_RUNTIME_VALIDATION ??= "true";

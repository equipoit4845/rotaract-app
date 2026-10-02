import { ExecutionContext, Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

/** Loopback or RFC 1918 / Docker networks: the Cloudflare tunnel and the Web's BFF. */
const TRUSTED_PROXY =
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|::ffff:(127|10|192\.168|172\.(1[6-9]|2\d|3[01]))\.)/;

/**
 * Rate limiting keyed by the real client. Every public request reaches the
 * Kernel from a trusted hop on this host (cloudflared on loopback, or the
 * Web's server-side routes on the Docker network), so keying by the socket
 * address would put every user in one bucket. From a trusted hop we use
 * CF-Connecting-IP, then the first X-Forwarded-For entry; from anywhere else
 * the forwarded headers are ignored (they'd be spoofable).
 */
@Injectable()
export class KernelThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(request: Record<string, any>): Promise<string> {
    return clientIp(request);
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (process.env.KERNEL_RATE_LIMIT_ENABLED === "false") return true;
    return super.shouldSkip(context);
  }
}

export function clientIp(request: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}): string {
  const socketIp = request.ip ?? "";
  if (!TRUSTED_PROXY.test(socketIp)) return socketIp;
  const header = (name: string) => {
    const value = request.headers?.[name];
    return Array.isArray(value) ? value[0] : value;
  };
  const cf = header("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const forwarded = header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || socketIp;
}

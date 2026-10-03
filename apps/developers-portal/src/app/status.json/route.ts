import { readStatus, unreachableStatus } from "@/lib/status";

// E12.1: the kernel's GET /status, served from the portal so it still
// answers (with MAJOR_OUTAGE) when the kernel does not.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const read = await readStatus();
  const body = read.ok ? read.summary : unreachableStatus(read.reason);
  return Response.json(body, {
    headers: {
      "Cache-Control": "public, max-age=30",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

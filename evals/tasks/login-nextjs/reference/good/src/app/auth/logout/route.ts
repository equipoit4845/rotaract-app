import { mr } from "@/lib/mirotaract";

export const dynamic = "force-dynamic";
export const POST = (request: Request) => mr().logout(request);

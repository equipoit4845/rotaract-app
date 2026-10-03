import { mr } from "@/lib/mirotaract";

export const dynamic = "force-dynamic";
export const GET = (request: Request) => mr().callback(request);

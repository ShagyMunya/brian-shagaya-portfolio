import { env } from "cloudflare:workers";
import { handleMarketRequest, type MarketEnv } from "@/lib/marketplace";
export const dynamic = "force-dynamic";
const handle = (request: Request) => handleMarketRequest(request, env as unknown as MarketEnv);
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;

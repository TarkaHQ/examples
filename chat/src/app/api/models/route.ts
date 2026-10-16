import { errorResponse, getModels } from "@/lib/server/tarka";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]);
    return Response.json(await getModels(signal), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

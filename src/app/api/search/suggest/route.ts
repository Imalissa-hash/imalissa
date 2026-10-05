import { NextRequest } from "next/server";
import { withApi, jsonOk } from "@/lib/api";
import { getSuggestions } from "@/lib/queries";

/** Type-ahead suggestions: products + categories + brands. */
export const GET = withApi(
  async (req: NextRequest) => {
    const q = req.nextUrl.searchParams.get("q") ?? "";
    if (q.trim().length < 2) return jsonOk([]);
    const items = await getSuggestions(q);
    return jsonOk(items);
  },
  { sameOrigin: false }
);

export const dynamic = "force-dynamic";

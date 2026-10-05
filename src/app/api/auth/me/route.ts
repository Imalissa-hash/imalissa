import { withApi, jsonOk } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";

/** Current session user (or null) — used by the client store. */
export const GET = withApi(async () => {
  const user = await getSessionUser();
  return jsonOk(user);
});

export const dynamic = "force-dynamic";

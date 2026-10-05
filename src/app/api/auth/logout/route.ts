import { withApi, jsonOk } from "@/lib/api";
import { destroySession } from "@/lib/auth";

export const POST = withApi(async () => {
  await destroySession();
  return jsonOk({ loggedOut: true });
});

export const dynamic = "force-dynamic";

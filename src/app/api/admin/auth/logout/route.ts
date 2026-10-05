import { withApi, jsonOk } from "@/lib/api";
import { destroyAdminSession } from "@/lib/admin-auth";

/** POST /api/admin/auth/logout */
export const POST = withApi(async () => {
  await destroyAdminSession();
  return jsonOk({ loggedOut: true });
});

export const dynamic = "force-dynamic";

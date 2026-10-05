import { withApi, jsonOk } from "@/lib/api";
import { getAdmin } from "@/lib/admin-auth";

/** GET /api/admin/auth/me — current admin identity (or null). */
export const GET = withApi(async () => {
  const admin = await getAdmin();
  return jsonOk(admin);
});

export const dynamic = "force-dynamic";

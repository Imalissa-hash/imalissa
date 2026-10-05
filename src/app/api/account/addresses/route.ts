import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { unauthorized, notFound } from "@/lib/errors";
import { prisma } from "@/lib/db";

const addressSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["HOME", "OFFICE", "OTHER"]).default("HOME"),
  fullName: z.string().min(2).max(80),
  phone: z.string().regex(/^01[3-9]\d{8}$/, "Enter a valid BD mobile number"),
  email: z.string().email().optional().or(z.literal("")),
  division: z.string().min(2),
  district: z.string().min(2),
  area: z.string().min(1),
  fullAddress: z.string().min(8, "Please enter your full address").max(300),
  instructions: z.string().max(300).optional().or(z.literal("")),
  isDefault: z.boolean().default(false),
});

export const GET = withApi(async () => {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  const addresses = await prisma.address.findMany({
    where: { userId: user.id },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
  return jsonOk(addresses);
});

export const POST = withApi(async (req: NextRequest) => {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  const body = parseBody(addressSchema, await req.json().catch(() => ({})));

  if (body.isDefault) {
    await prisma.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
  }

  const created = await prisma.address.create({
    data: {
      userId: user.id,
      type: body.type,
      fullName: body.fullName,
      phone: body.phone,
      email: body.email || null,
      division: body.division,
      district: body.district,
      area: body.area,
      fullAddress: body.fullAddress,
      instructions: body.instructions || null,
      isDefault: body.isDefault,
    },
  });

  return jsonOk(created);
});

export const PATCH = withApi(async (req: NextRequest) => {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  const body = parseBody(addressSchema.partial({ isDefault: true }).extend({ id: z.string().min(1) }), await req.json().catch(() => ({})));

  const existing = await prisma.address.findFirst({
    where: { id: body.id, userId: user.id },
  });
  if (!existing) throw notFound("Address not found");

  if (body.isDefault) {
    await prisma.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
  }

  const { id, ...data } = body;
  const updated = await prisma.address.update({
    where: { id },
    data: {
      ...(data.type ? { type: data.type } : {}),
      ...(data.fullName ? { fullName: data.fullName } : {}),
      ...(data.phone ? { phone: data.phone } : {}),
      ...(data.email !== undefined ? { email: data.email || null } : {}),
      ...(data.division ? { division: data.division } : {}),
      ...(data.district ? { district: data.district } : {}),
      ...(data.area ? { area: data.area } : {}),
      ...(data.fullAddress ? { fullAddress: data.fullAddress } : {}),
      ...(data.instructions !== undefined ? { instructions: data.instructions || null } : {}),
      ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
    },
  });

  return jsonOk(updated);
});

export const DELETE = withApi(async (req: NextRequest) => {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) throw notFound("Address id required");

  await prisma.address.deleteMany({ where: { id, userId: user.id } });
  return jsonOk({ deleted: true });
});

export const dynamic = "force-dynamic";

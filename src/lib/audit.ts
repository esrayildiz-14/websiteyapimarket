import "server-only";
import { prisma } from "@/lib/prisma";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/** Decimal/Date gibi değerleri JSON'a güvenli çevirir */
export function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v))) as Json;
}

export async function audit(userId: string, action: string, entity: string, entityId: string | null, before?: unknown, after?: unknown) {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      entity,
      entityId,
      before: before === undefined ? undefined : (toJson(before) as never),
      after: after === undefined ? undefined : (toJson(after) as never),
    },
  });
}

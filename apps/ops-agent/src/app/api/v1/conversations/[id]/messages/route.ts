import { operatorReplySchema, sendOperatorReply } from "@/server/domains/conversations";
import { json, parseId, route } from "@/server/http/api";

export const POST = route<{ id: string }>({ permission: "conversations:reply" }, async ({ db, tenant, params, body }) =>
  json({ message: await sendOperatorReply(db, tenant, parseId(params), (await body(operatorReplySchema)).body) }, { status: 201 }),
);

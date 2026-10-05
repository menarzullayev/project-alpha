import { courseInputSchema, deleteCourse, getCourse, updateCourse } from "@/server/domains/courses";
import { parseId, route } from "@/server/http/api";

export const GET = route<{ id: string }>({ permission: "crm:read" }, async ({ db, tenant, params }) => ({ course: await getCourse(db, tenant, parseId(params)) }));

export const PATCH = route<{ id: string }>({ permission: "catalog:write" }, async ({ db, tenant, params, body }) => ({
  course: await updateCourse(db, tenant, parseId(params), await body(courseInputSchema.partial())),
}));

export const DELETE = route<{ id: string }>({ permission: "catalog:write" }, async ({ db, tenant, params }) => {
  await deleteCourse(db, tenant, parseId(params));
  return { ok: true };
});

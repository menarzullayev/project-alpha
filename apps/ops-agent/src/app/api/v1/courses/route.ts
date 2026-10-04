import { courseInputSchema, createCourse, listCourses } from "@/server/domains/courses";
import { json, route } from "@/server/http/api";

export const GET = route({ permission: "crm:read" }, async ({ db, tenant }) => ({ courses: await listCourses(db, tenant) }));

export const POST = route({ permission: "catalog:write" }, async ({ db, tenant, body }) =>
  json({ course: await createCourse(db, tenant, await body(courseInputSchema)) }, { status: 201 }),
);

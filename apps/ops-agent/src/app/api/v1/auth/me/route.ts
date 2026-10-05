import { route } from "@/server/http/api";

export const GET = route({ auth: "required" }, async ({ session }) => ({
  user: session!.user,
  organization: session!.org,
  role: session!.role,
  memberships: session!.memberships,
}));

import { Badge, type Tone } from "./ui/primitives";

const lead: Record<string, [string, Tone]> = {
  new: ["New", "blue"],
  contacted: ["Contacted", "indigo"],
  qualified: ["Qualified", "violet"],
  trial_booked: ["Trial booked", "amber"],
  won: ["Won", "green"],
  lost: ["Lost", "slate"],
};
const booking: Record<string, [string, Tone]> = {
  pending: ["Pending", "amber"],
  confirmed: ["Confirmed", "blue"],
  attended: ["Attended", "green"],
  no_show: ["No-show", "red"],
  cancelled: ["Cancelled", "slate"],
};
const conversation: Record<string, [string, Tone]> = {
  bot: ["AI agent", "indigo"],
  handoff: ["Needs human", "red"],
  closed: ["Closed", "slate"],
};
const role: Record<string, [string, Tone]> = {
  owner: ["Owner", "violet"],
  admin: ["Admin", "indigo"],
  operator: ["Operator", "blue"],
  viewer: ["Viewer", "slate"],
};

export const LEAD_LABELS = Object.fromEntries(Object.entries(lead).map(([k, v]) => [k, v[0]]));
export const BOOKING_LABELS = Object.fromEntries(Object.entries(booking).map(([k, v]) => [k, v[0]]));

export function LeadStatusBadge({ status }: { status: string }) {
  const [l, t] = lead[status] ?? [status, "slate"];
  return <Badge tone={t}>{l}</Badge>;
}
export function BookingStatusBadge({ status }: { status: string }) {
  const [l, t] = booking[status] ?? [status, "slate"];
  return <Badge tone={t}>{l}</Badge>;
}
export function ConversationStatusBadge({ status }: { status: string }) {
  const [l, t] = conversation[status] ?? [status, "slate"];
  return <Badge tone={t}>{l}</Badge>;
}
export function RoleBadge({ role: r }: { role: string }) {
  const [l, t] = role[r] ?? [r, "slate"];
  return <Badge tone={t}>{l}</Badge>;
}

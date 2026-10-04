import { CalendarPlus, GraduationCap, Pencil, Plus } from "lucide-react";
import { CourseForm, SlotForm } from "@/components/catalog/forms";
import { ActionButton, ModalButton } from "@/components/ui/interactive";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { getDb } from "@/server/db/client";
import { listCourses, listSlots } from "@/server/domains/courses";
import { requirePage } from "@/server/http/page-auth";
import { can } from "@/server/rbac";
import { formatDateTime, formatMoney } from "@/lib/format";

export const metadata = { title: "Courses" };

export default async function CoursesPage() {
  const { tenant, session } = await requirePage("crm:read");
  const db = getDb();
  const [courses, slots] = await Promise.all([listCourses(db, tenant), listSlots(db, tenant, { upcomingOnly: true, limit: 500 })]);
  const canWrite = can(tenant.role, "catalog:write");
  const tz = session.org!.timezone;
  const currency = session.org!.currency;
  return (
    <div>
      <PageHeader
        title="Courses & trial slots"
        description="The agent only quotes prices and offers times that exist here."
        actions={
          canWrite && (
            <ModalButton label={<><Plus className="h-4 w-4" /> New course</>} title="New course">
              <CourseForm />
            </ModalButton>
          )
        }
      />
      {courses.length === 0 ? (
        <Card>
          <EmptyState icon={<GraduationCap className="h-5 w-5" />} title="No courses yet" description="Add your first course with its price and schedule, then add trial lesson slots." />
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {courses.map((c) => {
            const courseSlots = slots.filter((s) => s.courseId === c.id);
            return (
              <Card key={c.id} className="flex flex-col">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-slate-900">{c.name}</h2>
                      {!c.isActive && <Badge>inactive</Badge>}
                      <Badge tone="indigo">{c.format}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{c.description || <span className="text-slate-400">No description</span>}</p>
                    <p className="mt-2 text-sm">
                      <span className="font-semibold text-slate-900">{formatMoney(c.priceAmount, currency)}</span>
                      <span className="text-slate-500"> / {c.pricePeriod}</span>
                      {c.scheduleText && <span className="text-slate-500"> · {c.scheduleText}</span>}
                    </p>
                    {c.keywords.length > 0 && <p className="mt-1 truncate text-xs text-slate-400">Keywords: {c.keywords.join(", ")}</p>}
                  </div>
                  {canWrite && (
                    <ModalButton variant="secondary" label={<Pencil className="h-4 w-4" aria-label="Edit course" />} title={`Edit ${c.name}`}>
                      <CourseForm course={c} />
                    </ModalButton>
                  )}
                </div>
                <div className="flex-1 p-5">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-medium text-slate-700">Upcoming trial slots</h3>
                    {canWrite && (
                      <ModalButton variant="secondary" label={<><CalendarPlus className="h-4 w-4" /> Add slot</>} title={`Trial slot — ${c.name}`}>
                        <SlotForm courseId={c.id} timeZone={tz} />
                      </ModalButton>
                    )}
                  </div>
                  {courseSlots.length === 0 ? (
                    <p className="text-sm text-amber-700">No open slots — the agent will hand booking requests for this course to your team.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100 text-sm">
                      {courseSlots.slice(0, 8).map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                          <span className="text-slate-800">
                            {formatDateTime(s.startsAt, tz)}
                            {s.location && <span className="text-slate-500"> · {s.location}</span>}
                          </span>
                          <span className="flex items-center gap-2">
                            <Badge tone={s.available === 0 ? "red" : "green"}>
                              {s.booked}/{s.capacity} booked
                            </Badge>
                            {canWrite && (
                              <ActionButton action={`/api/v1/slots/${s.id}`} method="DELETE" variant="ghost" confirm="Remove this slot? Existing bookings are kept.">
                                Remove
                              </ActionButton>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

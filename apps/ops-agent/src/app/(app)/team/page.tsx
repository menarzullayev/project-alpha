import { RoleBadge } from "@/components/status";
import { InviteButton } from "@/components/team/invite";
import { ActionButton, InlineSelect } from "@/components/ui/interactive";
import { Avatar, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { getDb } from "@/server/db/client";
import { listMembers, listPendingInvitations } from "@/server/domains/team";
import { requirePage } from "@/server/http/page-auth";
import { can, canAssignRole, ROLES } from "@/server/rbac";
import { formatDate, timeAgo } from "@/lib/format";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const { tenant, session } = await requirePage("team:read");
  const db = getDb();
  const canManage = can(tenant.role, "team:manage");
  const [members, invites] = await Promise.all([listMembers(db, tenant), canManage ? listPendingInvitations(db, tenant) : Promise.resolve([])]);
  const assignable = ROLES.filter((r) => canAssignRole(tenant.role, r)).reverse();
  const invitable = assignable.filter((r) => r !== "owner");
  const tz = session.org!.timezone;
  return (
    <div className="space-y-6">
      <PageHeader title="Team" description="Who can access this workspace and what they can do." actions={canManage && <InviteButton roles={invitable} />} />
      <Card>
        <Table>
          <thead className="bg-slate-50">
            <tr>
              <Th>Member</Th>
              <Th>Role</Th>
              <Th className="hidden md:table-cell">Last sign-in</Th>
              <Th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {members.map((m) => {
              const self = m.userId === tenant.userId;
              const editable = canManage && !self && canAssignRole(tenant.role, m.role);
              return (
                <tr key={m.userId}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={m.name} />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">
                          {m.name} {self && <span className="text-xs font-normal text-slate-400">(you)</span>}
                        </p>
                        <p className="truncate text-xs text-slate-500">{m.email}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    {editable ? (
                      <InlineSelect action={`/api/v1/team/members/${m.userId}`} field="role" value={m.role} label={`Role for ${m.name}`} options={assignable.map((r) => ({ value: r, label: r[0].toUpperCase() + r.slice(1) }))} />
                    ) : (
                      <RoleBadge role={m.role} />
                    )}
                  </Td>
                  <Td className="hidden text-slate-500 md:table-cell">{m.lastLoginAt ? timeAgo(m.lastLoginAt) : "—"}</Td>
                  <Td className="text-right">
                    {editable && (
                      <ActionButton action={`/api/v1/team/members/${m.userId}`} method="DELETE" variant="ghost" confirm={`Remove ${m.name} from the workspace?`}>
                        Remove
                      </ActionButton>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
      {canManage && (
        <Card>
          <CardHeader title="Pending invitations" />
          {invites.length === 0 ? (
            <EmptyState title="No pending invitations" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {invites.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span>
                    <span className="font-medium text-slate-900">{inv.email}</span> <RoleBadge role={inv.role} />
                    <span className="ml-2 text-xs text-slate-500">expires {formatDate(inv.expiresAt, tz)}</span>
                  </span>
                  <ActionButton action={`/api/v1/team/invitations/${inv.id}`} method="DELETE" variant="ghost">
                    Revoke
                  </ActionButton>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

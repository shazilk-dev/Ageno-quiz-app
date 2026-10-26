import { ArrowDown, ArrowUp } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import type { AdminUserDTO } from "@/lib/admin-types";
import { cn } from "@/lib/utils";

export type UserSortKey = "name" | "email" | "role" | "joined" | "lastLogin";
export type SortDirection = "asc" | "desc";

interface UsersTableProps {
  users: AdminUserDTO[];
  /** Your own uid: your row has no role or delete buttons (the server refuses them too). */
  currentUid?: string;
  sortKey: UserSortKey;
  direction: SortDirection;
  onSort: (key: UserSortKey) => void;
  onToggleRole: (user: AdminUserDTO) => void;
  onDelete: (user: AdminUserDTO) => void;
}

const date = (ms: number | null, empty: string) =>
  ms
    ? new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : empty;

const th = "px-3 py-3 text-left first:pl-5 last:pr-5";
const td = "px-3 py-3 first:pl-5 last:pr-5";

function SortHeader({
  label,
  column,
  active,
  direction,
  onSort,
  className,
}: {
  label: string;
  column: UserSortKey;
  active: UserSortKey;
  direction: SortDirection;
  onSort: (key: UserSortKey) => void;
  className?: string;
}) {
  const isActive = column === active;
  const Arrow = direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={isActive ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={cn(th, className)}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className="text-label transition-fast inline-flex min-h-11 items-center gap-1 hover:text-text"
      >
        {label}
        {isActive && <Arrow className="size-3.5" aria-hidden="true" />}
      </button>
    </th>
  );
}

/** People, one per row. Columns that don't fit drop away on narrower screens; the name and the actions stay. */
export function UsersTable({
  users,
  currentUid,
  sortKey,
  direction,
  onSort,
  onToggleRole,
  onDelete,
}: UsersTableProps) {
  const header = { active: sortKey, direction, onSort };
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">People with an account</caption>
          <thead className="border-border border-b">
            <tr>
              <SortHeader label="Person" column="name" {...header} />
              <SortHeader label="Role" column="role" {...header} />
              <SortHeader label="Joined" column="joined" className="hidden md:table-cell" {...header} />
              <SortHeader label="Last sign-in" column="lastLogin" className="hidden lg:table-cell" {...header} />
              <th scope="col" className={cn(th, "text-right")}>
                <span className="text-label">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => {
              const you = user.id === currentUid;
              const name = user.displayName || "No name";
              return (
                <tr key={user.id}>
                  <td className={cn(td, "max-w-[16rem]")}>
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-raised font-mono text-sm"
                      >
                        {(user.displayName || user.email || "?").charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {name}
                          {you && <span className="ml-2 text-text-muted">(you)</span>}
                        </p>
                        <p className="truncate text-text-muted">{user.email || "No email"}</p>
                      </div>
                    </div>
                  </td>
                  <td className={td}>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant={user.role === "admin" ? "teal" : "outline"}>
                        {user.role === "admin" ? "Admin" : "Member"}
                      </Badge>
                      {!user.emailVerified && <Badge>Unverified</Badge>}
                    </div>
                  </td>
                  <td className={cn(td, "hidden font-mono text-text-muted md:table-cell")}>
                    {date(user.createdAt, "Unknown")}
                  </td>
                  <td className={cn(td, "hidden font-mono text-text-muted lg:table-cell")}>
                    {date(user.lastLoginAt, "Never")}
                  </td>
                  <td className={td}>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={you}
                        onClick={() => onToggleRole(user)}
                        aria-label={`${user.role === "admin" ? "Make member" : "Make admin"}: ${name}`}
                      >
                        {user.role === "admin" ? "Make member" : "Make admin"}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={you}
                        onClick={() => onDelete(user)}
                        aria-label={`Delete ${name}`}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

"use client";

import { Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import {
  UsersTable,
  type SortDirection,
  type UserSortKey,
} from "@/components/admin/UsersTable";
import {
  Alert,
  Button,
  Dialog,
  EmptyState,
  FilterTabs,
  SearchInput,
  Skeleton,
  StatStrip,
  useToast,
} from "@/components/ui";
import { useAuth } from "@/contexts/auth-context";
import { adminUsers } from "@/lib/admin-api";
import type { AdminUserDTO } from "@/lib/admin-types";
import { ApiRequestError } from "@/lib/api-client";

type RoleFilter = "all" | "admin" | "user";

const message = (error: unknown, fallback: string) =>
  error instanceof ApiRequestError ? error.message : fallback;

const sortValue = (user: AdminUserDTO, key: UserSortKey): string | number => {
  switch (key) {
    case "name":
      return (user.displayName || user.email).toLowerCase();
    case "email":
      return user.email.toLowerCase();
    case "role":
      return user.role;
    case "joined":
      return user.createdAt ?? 0;
    case "lastLogin":
      return user.lastLoginAt ?? 0;
  }
};

export default function UsersPage() {
  const { toast } = useToast();
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUserDTO[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RoleFilter>("all");
  const [sortKey, setSortKey] = useState<UserSortKey>("joined");
  const [direction, setDirection] = useState<SortDirection>("desc");

  const [roleChange, setRoleChange] = useState<AdminUserDTO | null>(null);
  const [deleting, setDeleting] = useState<AdminUserDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setUsers(null);
    try {
      const result = await adminUsers.list();
      setUsers(result.users);
      setTotal(result.total);
    } catch (failure) {
      setError(message(failure, "We couldn't load the users. Try again."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const list = users ?? [];
    const admins = list.filter((user) => user.role === "admin").length;
    return {
      all: list.length,
      admin: admins,
      user: list.length - admins,
      verified: list.filter((user) => user.emailVerified).length,
    };
  }, [users]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = (users ?? []).filter(
      (user) =>
        (filter === "all" || user.role === filter) &&
        (!term ||
          user.email.toLowerCase().includes(term) ||
          user.displayName.toLowerCase().includes(term))
    );
    const sign = direction === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      const x = sortValue(a, sortKey);
      const y = sortValue(b, sortKey);
      return (x < y ? -1 : x > y ? 1 : 0) * sign;
    });
  }, [users, search, filter, sortKey, direction]);

  const sortBy = (key: UserSortKey) => {
    if (key === sortKey) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // People expect names and roles A to Z, and dates newest first.
      setDirection(key === "joined" || key === "lastLogin" ? "desc" : "asc");
    }
  };

  const closeDialogs = () => {
    if (busy) return;
    setRoleChange(null);
    setDeleting(null);
  };

  const confirmRoleChange = async () => {
    if (!roleChange) return;
    const target = roleChange;
    const role = target.role === "admin" ? "user" : "admin";
    setBusy(true);
    setDialogError(null);
    try {
      await adminUsers.setRole(target.id, role);
      setUsers((current) => current?.map((user) => (user.id === target.id ? { ...user, role } : user)) ?? null);
      toast({
        title: role === "admin" ? "Admin added" : "Admin removed",
        description: `${target.displayName || target.email} is now ${role === "admin" ? "an admin" : "a member"}.`,
        variant: "success",
      });
      setRoleChange(null);
    } catch (failure) {
      setDialogError(message(failure, "We couldn't change the role. Try again."));
    } finally {
      setBusy(false);
    }
  };

  // Deleting a person removes their sign-in account too (on the server), not just their profile.
  const confirmDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    setBusy(true);
    setDialogError(null);
    try {
      await adminUsers.remove(target.id);
      setUsers((current) => current?.filter((user) => user.id !== target.id) ?? null);
      setTotal((current) => Math.max(0, current - 1));
      toast({ title: "User deleted", variant: "success" });
      setDeleting(null);
    } catch (failure) {
      setDialogError(message(failure, "We couldn't delete this user. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setFilter("all");
  };
  const targetName = (user: AdminUserDTO | null) => user?.displayName || user?.email || "this person";

  return (
    <AdminPage title="Users" description="Who has an account, and who can manage the quizzes.">
      {error ? (
        <Alert
          variant="error"
          title="Couldn't load the users"
          action={
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Try again
            </Button>
          }
        >
          {error}
        </Alert>
      ) : users === null ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading users">
          <Skeleton className="h-[5.5rem] w-full rounded-lg" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      ) : (
        <div className="space-y-6">
          <StatStrip
            stats={[
              { label: "People", value: String(total) },
              { label: "Admins", value: String(counts.admin) },
              { label: "Members", value: String(counts.user) },
              { label: "Verified email", value: String(counts.verified) },
            ]}
          />
          {total > users.length && (
            <Alert variant="info">
              Showing the {users.length} newest of {total} people. The search and the numbers above cover
              only these.
            </Alert>
          )}

          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-border border-b">
            <FilterTabs<RoleFilter>
              label="Filter by role"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "Everyone", count: counts.all },
                { value: "admin", label: "Admins", count: counts.admin },
                { value: "user", label: "Members", count: counts.user },
              ]}
            />
            <SearchInput
              label="Search people"
              placeholder="Search by name or email"
              value={search}
              onChange={setSearch}
              className="mb-2 w-full sm:w-72"
            />
          </div>

          {users.length === 0 ? (
            <EmptyState icon={Users} title="No one has signed up yet" description="People show up here once they create an account." />
          ) : visible.length === 0 ? (
            <EmptyState
              title="No one matches"
              description="Try a different name, or clear the search and filter."
              action={
                <Button variant="secondary" onClick={clearFilters}>
                  Clear search and filter
                </Button>
              }
            />
          ) : (
            <UsersTable
              users={visible}
              currentUid={me?.uid}
              sortKey={sortKey}
              direction={direction}
              onSort={sortBy}
              onToggleRole={(user) => {
                setDialogError(null);
                setRoleChange(user);
              }}
              onDelete={(user) => {
                setDialogError(null);
                setDeleting(user);
              }}
            />
          )}
        </div>
      )}

      <Dialog
        open={roleChange !== null}
        onClose={closeDialogs}
        dismissible={!busy}
        title={
          roleChange?.role === "admin"
            ? `Remove admin from ${targetName(roleChange)}?`
            : `Make ${targetName(roleChange)} an admin?`
        }
        description={
          roleChange?.role === "admin"
            ? "They lose access to the admin screens straight away, and their current sign-in is ended."
            : "Admins can create, edit and delete any quiz, see every result and manage other people's accounts."
        }
        footer={
          <>
            <Button variant="ghost" onClick={closeDialogs} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={roleChange?.role === "admin" ? "danger" : "primary"}
              onClick={confirmRoleChange}
              loading={busy}
            >
              {roleChange?.role === "admin" ? "Remove admin" : "Make admin"}
            </Button>
          </>
        }
      >
        {roleChange && dialogError && <Alert variant="error">{dialogError}</Alert>}
      </Dialog>

      <Dialog
        open={deleting !== null}
        onClose={closeDialogs}
        dismissible={!busy}
        title={`Delete ${targetName(deleting)}?`}
        description="This deletes their account, so they can no longer sign in, along with their profile and any attempt in progress. Quiz results they already earned are kept."
        footer={
          <>
            <Button variant="ghost" onClick={closeDialogs} disabled={busy}>
              Keep user
            </Button>
            <Button variant="danger" onClick={confirmDelete} loading={busy}>
              Delete user
            </Button>
          </>
        }
      >
        {deleting && dialogError && <Alert variant="error">{dialogError}</Alert>}
      </Dialog>
    </AdminPage>
  );
}

import type { Metadata } from "next";
import { loadForAdmin } from "@/lib/server/admin-access";
import { listUsers } from "@/lib/server/admin-users";
import UsersClient from "./UsersClient";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  return <UsersClient initial={await loadForAdmin(listUsers)} />;
}

/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/firebase/client";
import { FiSearch, FiUserPlus, FiFilter } from "react-icons/fi";
import { Alert, Button, Dialog, useToast } from "@/components/ui";
import { adminUsers } from "@/lib/admin-api";
import { ApiRequestError } from "@/lib/api-client";

interface User {
  id: string;
  email: string;
  displayName: string;
  role: string;
  createdAt: any;
  lastLoginAt: any;
  emailVerified: boolean;
  photoURL?: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filter, setFilter] = useState<"all" | "admin" | "user">("all");
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const { toast } = useToast();
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    admins: 0,
    users: 0,
    verified: 0,
  });

  // Define filterAndSortUsers using useCallback
  const filterAndSortUsers = useCallback(() => {
    // First filter the users
    const filtered = users.filter((user) => {
      // Apply role filter
      if (filter === "admin" && user.role !== "admin") return false;
      if (filter === "user" && user.role !== "user") return false;

      // Apply search filter if search term exists
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          user.email?.toLowerCase().includes(term) ||
          false ||
          user.displayName?.toLowerCase().includes(term) ||
          false
        );
      }

      return true;
    });

    // Then sort the filtered users
    filtered.sort((a, b) => {
      let aValue = a[sortBy as keyof User];
      let bValue = b[sortBy as keyof User];

      // Handle date sorting specifically
      if (sortBy === "createdAt" || sortBy === "lastLoginAt") {
        if (aValue && typeof aValue === "object" && "toDate" in aValue) {
          aValue = aValue.toDate();
        } else if (typeof aValue === "number") {
          aValue = new Date(aValue);
        }

        if (bValue && typeof bValue === "object" && "toDate" in bValue) {
          bValue = bValue.toDate();
        } else if (typeof bValue === "number") {
          bValue = new Date(bValue);
        }

        // Convert to timestamps for comparison
        aValue = aValue instanceof Date ? aValue.getTime() : 0;
        bValue = bValue instanceof Date ? bValue.getTime() : 0;
      }

      // Apply sort order
      if (sortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    setFilteredUsers(filtered);
  }, [users, searchTerm, filter, sortBy, sortOrder]);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const usersRef = collection(db, "users");
      const q = query(usersRef, orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);

      const usersList: User[] = [];
      querySnapshot.forEach((doc) => {
        usersList.push({
          id: doc.id,
          ...(doc.data() as Omit<User, "id">),
        });
      });

      setUsers(usersList);

      // Update stats
      const adminCount = usersList.filter(
        (user) => user.role === "admin"
      ).length;
      const verifiedCount = usersList.filter(
        (user) => user.emailVerified
      ).length;

      setStats({
        total: usersList.length,
        admins: adminCount,
        users: usersList.length - adminCount,
        verified: verifiedCount,
      });
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch users on component mount
  useEffect(() => {
    fetchUsers();
  }, []);
  
  // Filter and sort users when dependencies change
  useEffect(() => {
    filterAndSortUsers();
  }, [filterAndSortUsers]);

  const handleUpdateRole = async (userId: string, newRole: string) => {
    try {
      setUpdatingUserId(userId);

      // Update the user role in Firestore
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, {
        role: newRole,
      });

      // Update local state
      setUsers((prevUsers) =>
        prevUsers.map((user) =>
          user.id === userId ? { ...user, role: newRole } : user
        )
      );

      // Update stats
      if (newRole === "admin") {
        setStats((prevStats) => ({
          ...prevStats,
          admins: prevStats.admins + 1,
          users: prevStats.users - 1,
        }));
      } else {
        setStats((prevStats) => ({
          ...prevStats,
          admins: prevStats.admins - 1,
          users: prevStats.users + 1,
        }));
      }
    } catch (error) {
      console.error("Error updating user role:", error);
      alert("Failed to update user role. Please try again.");
    } finally {
      setUpdatingUserId(null);
    }
  };

  // Deleting a person removes their sign-in account too (on the server), not just their profile.
  const confirmDeleteUser = async () => {
    if (!deletingUser) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await adminUsers.remove(deletingUser.id);
      const deleted = deletingUser;
      setUsers((prevUsers) => prevUsers.filter((user) => user.id !== deleted.id));
      setStats((prevStats) => ({
        ...prevStats,
        total: prevStats.total - 1,
        admins: deleted.role === "admin" ? prevStats.admins - 1 : prevStats.admins,
        users: deleted.role !== "admin" ? prevStats.users - 1 : prevStats.users,
        verified: deleted.emailVerified ? prevStats.verified - 1 : prevStats.verified,
      }));
      toast({ title: "User deleted", variant: "success" });
      setDeletingUser(null);
    } catch (error) {
      setDeleteError(
        error instanceof ApiRequestError
          ? error.message
          : "We couldn't delete this user. Try again."
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  // Toggle sort order
  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  // Format date to readable string
  const formatDate = (timestamp: any): string => {
    if (!timestamp) return "Never";

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-600">
            Manage users and their access permissions
          </p>
        </div>

        <button
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
          // Note: This should be replaced with proper functionality to add users if that feature is needed
          onClick={() =>
            alert(
              "To add users, please have them sign up through the registration page."
            )
          }
        >
          <FiUserPlus className="mr-2" />
          Invite User
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm font-medium text-gray-500">Total Users</p>
          <p className="mt-1 text-3xl font-semibold text-gray-900">
            {stats.total}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm font-medium text-gray-500">Administrators</p>
          <p className="mt-1 text-3xl font-semibold text-purple-600">
            {stats.admins}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm font-medium text-gray-500">Standard Users</p>
          <p className="mt-1 text-3xl font-semibold text-blue-600">
            {stats.users}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm font-medium text-gray-500">Verified Emails</p>
          <p className="mt-1 text-3xl font-semibold text-green-600">
            {stats.verified}
          </p>
        </div>
      </div>

      {/* Search and filters */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-4 flex flex-col md:flex-row md:items-center gap-4">
          <div className="relative flex-grow">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FiSearch className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
            />
          </div>

          <div className="flex items-center">
            <FiFilter className="mr-2 text-gray-400" />
            <select
              value={filter}
              onChange={(e) =>
                setFilter(e.target.value as "all" | "admin" | "user")
              }
              className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
            >
              <option value="all">All Users</option>
              <option value="admin">Admins Only</option>
              <option value="user">Standard Users Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center">
            <div className="inline-block animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full"></div>
            <p className="mt-2 text-gray-600">Loading users...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-6 text-center">
            {searchTerm || filter !== "all" ? (
              <>
                <p className="text-gray-600">
                  No users found matching your criteria
                </p>
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setFilter("all");
                  }}
                  className="mt-2 text-purple-600 hover:text-purple-800 underline"
                >
                  Clear filters
                </button>
              </>
            ) : (
              <p className="text-gray-600">No users available.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSort("name")}
                  >
                    <div className="flex items-center">
                      <span>User</span>
                      {sortBy === "name" && (
                        <span className="ml-1">
                          {sortOrder === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSort("email")}
                  >
                    <div className="flex items-center">
                      <span>Email</span>
                      {sortBy === "email" && (
                        <span className="ml-1">
                          {sortOrder === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSort("role")}
                  >
                    <div className="flex items-center">
                      <span>Role</span>
                      {sortBy === "role" && (
                        <span className="ml-1">
                          {sortOrder === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSort("createdAt")}
                  >
                    <div className="flex items-center">
                      <span>Joined</span>
                      {sortBy === "createdAt" && (
                        <span className="ml-1">
                          {sortOrder === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSort("lastLogin")}
                  >
                    <div className="flex items-center">
                      <span>Last Login</span>
                      {sortBy === "lastLogin" && (
                        <span className="ml-1">
                          {sortOrder === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {user.photoURL ? (
                          <img
                            src={user.photoURL}
                            alt={user.displayName || user.email}
                            className="h-10 w-10 rounded-full"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-gradient-to-r from-purple-400 to-purple-600 flex items-center justify-center text-white font-medium">
                            {(user.displayName || user.email || "?")
                              .charAt(0)
                              .toUpperCase()}
                          </div>
                        )}
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {user.displayName || "No Name"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{user.email}</div>
                      {user.emailVerified ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          Not Verified
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {user.role === "admin" ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                          Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          User
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(user.lastLoginAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-3">
                        <button
                          onClick={() =>
                            handleUpdateRole(
                              user.id,
                              user.role === "admin" ? "user" : "admin"
                            )
                          }
                          disabled={updatingUserId === user.id}
                          className={`text-${
                            user.role === "admin" ? "blue" : "purple"
                          }-600 hover:text-${
                            user.role === "admin" ? "blue" : "purple"
                          }-900 ${
                            updatingUserId === user.id
                              ? "opacity-50 cursor-not-allowed"
                              : ""
                          }`}
                        >
                          {updatingUserId === user.id
                            ? "Updating..."
                            : user.role === "admin"
                            ? "Make User"
                            : "Make Admin"}
                        </button>
                        <button
                          onClick={() => {
                            setDeleteError(null);
                            setDeletingUser(user);
                          }}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog
        open={deletingUser !== null}
        onClose={() => !deleteBusy && setDeletingUser(null)}
        dismissible={!deleteBusy}
        title={deletingUser ? `Delete ${deletingUser.displayName || deletingUser.email}?` : "Delete user"}
        description="This deletes their account, so they can no longer sign in, along with their profile and any attempt in progress. Quiz results they already earned are kept."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeletingUser(null)} disabled={deleteBusy}>
              Keep user
            </Button>
            <Button variant="danger" onClick={confirmDeleteUser} loading={deleteBusy}>
              Delete user
            </Button>
          </>
        }
      >
        {deleteError && <Alert variant="error">{deleteError}</Alert>}
      </Dialog>
    </div>
  );
}

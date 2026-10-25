"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import AdminProtected from "@/components/AdminProtected";
import { useAuth } from "@/contexts/auth-context";

// Admin navigation links
const adminNavLinks = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Quizzes", href: "/quizzes" },
  { name: "Users", href: "/users" },
  { name: "Reports", href: "/quiz-reports" },
  { name: "Settings", href: "/settings" },
];

/**
 * The admin chrome (navigation and the client-side role check). Access is decided on the server before
 * this renders, in `app/(admin)/layout.tsx`; the check here only keeps the UI honest while auth loads.
 */
export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin h-12 w-12 border-4 border-purple-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <AdminProtected
      fallback={
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Admin Access Required
          </h1>
          <p className="text-gray-600 mb-8">
            You need administrator privileges to view this page.
          </p>
          <Link
            href="/"
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-primary hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
          >
            Return to Home
          </Link>
        </div>
      }
    >
      <div className="min-h-screen bg-gray-50">
        {/* Top navigation */}
        <nav className="bg-white shadow-sm border-b border-gray-200">
          <div className="container mx-auto px-4">
            <div className="flex justify-between h-16">
              <div className="flex">
                <div className="flex-shrink-0 flex items-center">
                  <Link
                    href="/"
                    className="font-bold text-xl text-purple-primary"
                  >
                    Ageno Quiz Admin
                  </Link>
                </div>
                <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                  {adminNavLinks.map((link) => {
                    const isActive =
                      pathname === link.href ||
                      pathname.startsWith(`${link.href}/`);
                    return (
                      <Link
                        key={link.name}
                        href={link.href}
                        className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                          isActive
                            ? "border-purple-primary text-gray-900"
                            : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                        }`}
                      >
                        {link.name}
                      </Link>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center">
                <Link href="/" className="text-gray-500 hover:text-gray-700">
                  Exit Admin
                </Link>
              </div>
            </div>
          </div>
        </nav>

        {/* Mobile navigation */}
        <div className="sm:hidden bg-white border-b border-gray-200 overflow-x-auto">
          <div className="px-2 py-3 flex space-x-4">
            {adminNavLinks.map((link) => {
              const isActive =
                pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    isActive
                      ? "bg-purple-50 text-purple-primary"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  {link.name}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Page content */}
        <main>{children}</main>
      </div>
    </AdminProtected>
  );
}

// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// A stable object, like the real context.
const signedOut = { user: null, loading: false };
vi.mock("@/contexts/auth-context", () => ({ useAuth: () => signedOut }));

import Home from "@/app/(public)/page";

afterEach(cleanup);

describe("Landing page", () => {
  it("has one h1 and offers Join a quiz and Enter code above the rest", () => {
    render(<Home />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/stand\./);
    expect(screen.getByRole("link", { name: /Join a quiz/ }).getAttribute("href")).toBe("/join");
    expect(screen.getByRole("link", { name: "Enter code" }).getAttribute("href")).toBe("#enter-code");
    expect(document.getElementById("enter-code")).toBeTruthy();
  });

  it("puts a working access-code field in the code card, with a sign-in hint when signed out", () => {
    render(<Home />);
    const card = document.getElementById("enter-code") as HTMLElement;

    expect(within(card).getByLabelText("Access code")).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Join quiz" })).toBeTruthy();
    expect(within(card).getByRole("link", { name: "Sign in" })).toBeTruthy();
  });

  it("explains the steps in order and links the community in a new tab safely", () => {
    render(<Home />);

    const steps = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(steps).toHaveLength(4);
    expect(steps[0].textContent).toContain("01");
    expect(steps[3].textContent).toContain("See how you did");

    const community = screen.getByRole("link", { name: /Meet the community/ });
    expect(community.getAttribute("href")).toMatch(/\/community$/);
    expect(community.getAttribute("target")).toBe("_blank");
    expect(community.getAttribute("rel")).toContain("noopener");
  });

  it("makes no numeric claims about usage", () => {
    render(<Home />);
    expect(document.body.textContent).not.toMatch(/\d+\s*\+|\d+%|students daily|institutions|completion rate/i);
  });
});

import { agenoverseUrl } from "@/lib/utils";

export interface NavLink {
  label: string;
  href: string;
}

/** Primary navigation. "My quizzes" is added for signed-in users, "Admin" for admins (see Header). */
export const mainNav: NavLink[] = [
  { label: "Join a quiz", href: "/join" },
  { label: "Leaderboard", href: "/leaderboard" },
];

export const myQuizzesLink: NavLink = {
  label: "My quizzes",
  href: "/my-quizzes",
};

export const adminLink: NavLink = { label: "Admin", href: "/dashboard" };

/** Pages on the Agenoverse site, shown in the footer. */
export const agenoverseLinks: NavLink[] = [
  { label: "Community", href: agenoverseUrl("/community") },
  { label: "Agenoversity", href: agenoverseUrl("/agenoversity") },
  { label: "Playbook", href: agenoverseUrl("/playbook") },
  { label: "Contact", href: agenoverseUrl("/contact") },
  { label: "Privacy", href: agenoverseUrl("/privacy") },
];

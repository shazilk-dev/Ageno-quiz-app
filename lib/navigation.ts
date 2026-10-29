import { agenoverseUrl } from "@/lib/utils";

/**
 * Where to go after signing in. Only paths on this site are followed: anything else (another site, a
 * protocol-relative `//host`, a backslash trick) falls back to the home page, so a crafted
 * `?redirectTo=` link can't send someone elsewhere.
 */
export function safeRedirectPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  return value;
}

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
/** TEMPORARY: the maker's WhatsApp channel, offered beside the landing page's buttons. Remove with its button. */
export const WHATSAPP_CHANNEL_URL =
  "https://whatsapp.com/channel/0029VbDmcVV8F2p50lfBp10v";

/** The maker's own pages, shown in the footer's bottom bar. */
export const makerName = "Shazil Khan";
export const makerLinks: NavLink[] = [
  { label: "Portfolio", href: "https://www.shazilkhan.me" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/shazilkhan-dev/" },
];

export const agenoverseLinks: NavLink[] = [
  { label: "Community", href: agenoverseUrl("/community") },
  { label: "Agenoversity", href: agenoverseUrl("/agenoversity") },
  { label: "Playbook", href: agenoverseUrl("/playbook") },
  { label: "Contact", href: agenoverseUrl("/contact") },
  { label: "Privacy", href: agenoverseUrl("/privacy") },
];

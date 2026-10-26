"use client";

import { useState, type FormEvent } from "react";
import { Badge, Button, Input } from "@/components/ui";
import { updateUserProfile, sendVerificationEmail } from "@/lib/actions/auth.actions";
import type { User } from "firebase/auth";
import type { ProfileAction } from "./use-profile-action";

interface SectionProps {
  user: User;
  action: ProfileAction;
}

/** Display name, plus the state of the email address. */
export default function ProfileSection({ user, action }: SectionProps) {
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const { busy, run } = action;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(() => updateUserProfile(user, { displayName }), {
      success: "Profile updated.",
      failure: "We couldn't update your profile. Please try again.",
    });
  };

  const resend = () =>
    run(() => sendVerificationEmail(user), {
      success: "Verification email sent. Check your inbox.",
      failure: "We couldn't send the verification email. Please try again.",
    });

  return (
    <form onSubmit={submit} className="max-w-lg space-y-6">
      <Input
        label="Display name"
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        placeholder="Your display name"
        autoComplete="nickname"
        hint="Shown on the leaderboard."
      />

      <div>
        <Input
          label="Email address"
          type="email"
          value={user.email ?? ""}
          disabled
          readOnly
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Badge variant={user.emailVerified ? "teal" : "outline"}>
            {user.emailVerified ? "Verified" : "Not verified"}
          </Badge>
          {!user.emailVerified && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void resend()}
              disabled={busy}
            >
              Resend verification email
            </Button>
          )}
        </div>
      </div>

      <Button type="submit" loading={busy}>
        Save changes
      </Button>
    </form>
  );
}

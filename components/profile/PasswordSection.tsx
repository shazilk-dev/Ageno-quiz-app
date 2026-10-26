"use client";

import type { User } from "firebase/auth";
import { useState, type FormEvent } from "react";
import { Button, Input } from "@/components/ui";
import { updateUserPassword } from "@/lib/actions/auth.actions";
import type { ProfileAction } from "./use-profile-action";

interface SectionProps {
  user: User;
  action: ProfileAction;
}

type Field = "current" | "next" | "confirm";

export default function PasswordSection({ user, action }: SectionProps) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [problem, setProblem] = useState<{ field: Field; text: string } | null>(null);
  const { busy, run } = action;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!current) {
      setProblem({ field: "current", text: "Enter your current password." });
      return;
    }
    if (next.length < 8) {
      setProblem({ field: "next", text: "Use at least 8 characters." });
      return;
    }
    if (next !== confirm) {
      setProblem({ field: "confirm", text: "The passwords don't match." });
      return;
    }
    setProblem(null);
    void run(() => updateUserPassword(user, current, next), {
      success: "Password updated.",
      failure: "We couldn't change your password. Check your current password and try again.",
      onSuccess: () => {
        setCurrent("");
        setNext("");
        setConfirm("");
      },
    });
  };

  const errorFor = (field: Field) => (problem?.field === field ? problem.text : undefined);

  return (
    <form onSubmit={submit} className="max-w-lg space-y-6" noValidate>
      <Input
        label="Current password"
        type="password"
        value={current}
        onChange={(event) => setCurrent(event.target.value)}
        autoComplete="current-password"
        error={errorFor("current")}
        required
      />
      <Input
        label="New password"
        type="password"
        value={next}
        onChange={(event) => setNext(event.target.value)}
        autoComplete="new-password"
        hint="At least 8 characters."
        error={errorFor("next")}
        required
      />
      <Input
        label="Confirm new password"
        type="password"
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
        autoComplete="new-password"
        error={errorFor("confirm")}
        required
      />
      <Button type="submit" loading={busy}>
        Update password
      </Button>
    </form>
  );
}

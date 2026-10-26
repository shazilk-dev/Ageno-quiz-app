"use client";

import type { TotpSecret, User } from "firebase/auth";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { Button, Input } from "@/components/ui";
import {
  completeTotpMfaEnrollment,
  generateTotpSecret,
} from "@/lib/actions/auth.actions";
import type { ProfileAction } from "./use-profile-action";

interface Props {
  user: User;
  action: ProfileAction;
  onDone: () => void;
  onCancel: () => void;
}

/** Two steps: scan a QR code with an authenticator app, then enter the code it shows. */
export default function TotpMfaSetup({ user, action, onDone, onCancel }: Props) {
  const [secret, setSecret] = useState<TotpSecret | null>(null);
  const [code, setCode] = useState("");
  const { busy, run } = action;

  const start = () =>
    run(() => generateTotpSecret(user), {
      success: "Scan the code with your authenticator app, then enter the code it shows.",
      failure: "We couldn't start the setup. Please try again.",
      onSuccess: setSecret,
    });

  const verify = () => {
    if (!secret) return;
    void run(() => completeTotpMfaEnrollment(user, secret, code, "Authenticator app"), {
      success: "Your authenticator app is set up.",
      failure: "That code didn't work. Check it and try again.",
      onSuccess: onDone,
    });
  };

  return (
    <div className="rounded-lg border border-border p-4 sm:p-5">
      <h4 className="text-base">Set up an authenticator app</h4>

      {secret ? (
        <div className="mt-4 space-y-5">
          <div>
            <p className="text-sm text-text-muted">
              Scan this code with your authenticator app.
            </p>
            {/* White behind the code so scanners can read it on a dark page. */}
            <div className="mt-3 w-fit rounded-md bg-white p-3">
              <QRCodeSVG
                value={secret.generateQrCodeUrl(user.email ?? undefined, "Ageno Quiz")}
                size={176}
              />
            </div>
            <p className="mt-3 text-sm text-text-muted">
              Can&apos;t scan it? Enter this key instead:
            </p>
            <p className="mt-1 w-fit max-w-full break-all rounded-md bg-bg px-3 py-1.5 font-mono text-sm">
              {secret.secretKey}
            </p>
          </div>
          <Input
            label="Verification code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            hint="The 6-digit code in your app."
          />
          <div className="flex flex-wrap gap-3">
            <Button onClick={verify} loading={busy} disabled={!code}>
              Verify code
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setSecret(null);
                setCode("");
              }}
            >
              Back
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <p className="max-w-[65ch] text-sm text-text-muted">
            Use an app such as Google Authenticator, Microsoft Authenticator or
            Authy to make sign-in codes.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void start()} loading={busy}>
              Show QR code
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

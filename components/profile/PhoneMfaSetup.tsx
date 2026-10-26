"use client";

import type { User } from "firebase/auth";
import { useRef, useState } from "react";
import { Button, Input } from "@/components/ui";
import {
  completePhoneMfaEnrollment,
  startPhoneMfaEnrollment,
} from "@/lib/actions/auth.actions";
import type { ProfileAction } from "./use-profile-action";

interface Props {
  user: User;
  action: ProfileAction;
  onDone: () => void;
  onCancel: () => void;
}

/** Two steps: send a code to the phone, then enter it. */
export default function PhoneMfaSetup({ user, action, onDone, onCancel }: Props) {
  const [phone, setPhone] = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [code, setCode] = useState("");
  const recaptchaRef = useRef<HTMLDivElement>(null);
  const { busy, run } = action;

  const sendCode = () => {
    if (!phone || !recaptchaRef.current) return;
    const container = recaptchaRef.current;
    void run(() => startPhoneMfaEnrollment(user, phone, container), {
      success: "We sent a code to your phone. Enter it to finish.",
      failure: "We couldn't send the code. Check the number and try again.",
      onSuccess: (result) => setVerificationId(result.verificationId),
    });
  };

  const verify = () => {
    void run(() => completePhoneMfaEnrollment(user, verificationId, code, `Phone (${phone})`), {
      success: "Phone verification is on.",
      failure: "That code didn't work. Check it and try again.",
      onSuccess: onDone,
    });
  };

  return (
    <div className="rounded-lg border border-border p-4 sm:p-5">
      <h4 className="text-base">Set up phone verification</h4>

      {verificationId ? (
        <div className="mt-4 space-y-4">
          <Input
            label="Verification code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            hint="The code we sent to your phone."
          />
          <div className="flex flex-wrap gap-3">
            <Button onClick={verify} loading={busy} disabled={!code}>
              Verify code
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setVerificationId("");
                setCode("");
              }}
            >
              Back
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <Input
            label="Phone number"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="tel"
            placeholder="+1 555 123 4567"
            hint="Include your country code."
          />
          <div ref={recaptchaRef} />
          <div className="flex flex-wrap gap-3">
            <Button onClick={sendCode} loading={busy} disabled={!phone}>
              Send code
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

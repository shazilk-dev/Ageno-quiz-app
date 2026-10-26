export type PasswordStrength = "" | "weak" | "medium" | "strong";

/**
 * A rough guide for the sign-up form (not a rule: Firebase only requires 6 characters). Length sets the
 * starting point, and fewer than three kinds of character (upper, lower, digit, symbol) pulls it down.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (!password) return "";

  let strength: PasswordStrength =
    password.length < 6 ? "weak" : password.length < 10 ? "medium" : "strong";

  const kinds = [/[A-Z]/, /[a-z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  if (kinds < 2) strength = "weak";
  else if (kinds < 3 && strength === "strong") strength = "medium";

  return strength;
}

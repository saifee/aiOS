const COMMON = new Set(["password", "password1", "password12", "password123", "passw0rd123", "1234567890", "12345678910", "123456789012", "qwertyuiop", "qwerty12345", "qwerty123456", "iloveyou123", "welcome1234", "letmein1234", "administrator", "admin123456", "changeme123", "abcdefghij", "1q2w3e4r5t", "0123456789"]);

/** Returns a reason the password is too weak, or null when it is acceptable. Length (10+) is enforced by the schema. */
export function weakPassword(pw: string, email?: string, name?: string): string | null {
  const l = pw.toLowerCase();
  if (COMMON.has(l)) return "That password is too common. Choose something harder to guess.";
  if (/^(.)\1+$/.test(pw) || /^(0123456789|1234567890|abcdefghij)/.test(l)) return "That password is too predictable.";
  if (new Set(pw).size < 5) return "Use a wider mix of characters.";
  const local = (email ?? "").split("@")[0].toLowerCase();
  if (local.length >= 4 && l.includes(local)) return "Your password should not contain your email name.";
  const first = (name ?? "").split(/\s+/)[0].toLowerCase();
  if (first.length >= 4 && l.includes(first)) return "Your password should not contain your name.";
  return null;
}

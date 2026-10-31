export function maskMobile(mobile: string): string {
  const d = mobile.replace(/\D/g, "").slice(-10);
  return d.length < 4 ? "••••" : `${d.slice(0, 2)}••••••${d.slice(-2)}`;
}

export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}•••@${domain}`;
}

export function maskApaar(apaar: string): string {
  return `••••-••••-${apaar.slice(-4)}`;
}

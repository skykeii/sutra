export const WEBHOOK_EVENTS = ["over_intake", "over_quota", "cross_match", "marks_mismatch", "credential_revoked"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

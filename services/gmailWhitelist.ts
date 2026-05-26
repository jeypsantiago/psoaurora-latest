const DEFAULT_GMAIL_WHITELIST = [
  "supply.aurora@psa.gov.ph",
  "admin.aurora@psa.gov.ph",
];

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const extractEmail = (value: unknown): string | null => {
  if (typeof value === "string") {
    const match = value.match(EMAIL_PATTERN);
    return match?.[0]?.toLowerCase() || null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  return (
    extractEmail(candidate.sender) ||
    extractEmail(candidate.from) ||
    extractEmail(candidate.email) ||
    extractEmail(candidate.address)
  );
};

export const getDefaultGmailWhitelist = () => [...DEFAULT_GMAIL_WHITELIST];

export const normalizeGmailWhitelist = (
  value: unknown,
  fallback: string[] = DEFAULT_GMAIL_WHITELIST,
): string[] => {
  const source = Array.isArray(value) ? value : fallback;
  const unique = new Set<string>();

  source.forEach((entry) => {
    const email = extractEmail(entry);
    if (email) unique.add(email);
  });

  return Array.from(unique);
};

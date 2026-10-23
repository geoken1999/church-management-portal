// What a person signed in to the KingdomFlow Admin app may see and do. A platform owner has every scope; a
// service user has only the scopes listed on their row in platform_service_users. Every admin-app API route
// names the scope it needs, so adding a screen or a kind of user never changes how access is checked.

export const ADMIN_SCOPES = [
  "overview",
  "churches",
  "tickets",
  "billing",
  "health",
  "finance",
  "operations",
  "platform",
  "support",
  "users",
] as const;

export type AdminScope = (typeof ADMIN_SCOPES)[number];

export function isAdminScope(value: unknown): value is AdminScope {
  return (
    typeof value === "string" &&
    (ADMIN_SCOPES as readonly string[]).includes(value)
  );
}

/** Keeps only scopes this version knows, once each. */
export function cleanScopes(values: unknown): AdminScope[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter(isAdminScope))];
}

/** Scopes a service user can be given: "users" (managing the other admin-app users) is for platform owners only. */
export const GRANTABLE_SCOPES = ADMIN_SCOPES.filter((s) => s !== "users");

export function hasScope(scopes: readonly AdminScope[], needed: AdminScope) {
  return scopes.includes(needed);
}

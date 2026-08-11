export const MANAGER_PERMISSION_KEYS = [
  "products",
  "live",
  "members",
  "points",
  "rewards",
  "orders",
  "finance",
  "reviews",
  "notices",
  "coupons",
  "inquiries",
  "popups",
  "audit",
] as const;

export type ManagerPermission = (typeof MANAGER_PERMISSION_KEYS)[number];

export const DEFAULT_MANAGER_PERMISSIONS: ManagerPermission[] = [
  ...MANAGER_PERMISSION_KEYS,
];

export const SUPERVISOR_PERMISSIONS = [
  "dashboard",
  ...MANAGER_PERMISSION_KEYS,
  "administrators",
  "settings",
  "backup",
] as const;

export function parseManagerPermissions(value: unknown): ManagerPermission[] {
  let values: unknown[] = [];
  if (Array.isArray(value)) {
    values = value;
  } else if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      values = Array.isArray(parsed) ? parsed : [];
    } catch {
      values = value.split(",");
    }
  }
  const allowed = new Set<string>(MANAGER_PERMISSION_KEYS);
  return Array.from(
    new Set(
      values
        .map((item) => String(item).trim())
        .filter((item): item is ManagerPermission => allowed.has(item)),
    ),
  );
}

export function canAdmin(
  admin: { role: string; permissions: string[] },
  permission: string,
) {
  if (admin.role === "supervisor") return true;
  if (permission === "points" || permission === "rewards") {
    return admin.permissions.includes("points") || admin.permissions.includes("rewards");
  }
  return admin.permissions.includes(permission);
}

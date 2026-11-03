export type Role = "OWNER" | "MANAGER" | "WORKER";

const MANAGERS: Role[] = ["OWNER", "MANAGER"];
const OWNER: Role[] = ["OWNER"];

const RULES = {
  "records.write": ["OWNER", "MANAGER", "WORKER"],
  "farm.manage": MANAGERS,
  "inventory.manage": MANAGERS,
  "sales.manage": MANAGERS,
  "expenses.manage": MANAGERS,
  "team.manage": MANAGERS,
  "payroll.prepare": MANAGERS,
  "payroll.approve": OWNER,
  "money.withdraw": OWNER,
  "finance.view": OWNER,
  "users.manage": OWNER,
  "settings.manage": OWNER,
} satisfies Record<string, Role[]>;

export type Permission = keyof typeof RULES;

export function can(role: string, permission: Permission) {
  return (RULES[permission] as string[]).includes(role);
}

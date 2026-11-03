import { can, type Permission } from "./permissions";

export type NavItem = { href: string; label: string; icon: string; needs?: Permission };

const ITEMS: NavItem[] = [
  { href: "/today", label: "Today", icon: "sun" },
  { href: "/flocks", label: "Flocks", icon: "bird" },
  { href: "/health", label: "Health", icon: "syringe" },
  { href: "/inventory", label: "Inventory", icon: "boxes" },
  { href: "/farms", label: "Farms", icon: "warehouse" },
  { href: "/team", label: "Team", icon: "users" },
  { href: "/sales", label: "Sales", icon: "shopping", needs: "sales.manage" },
  { href: "/expenses", label: "Expenses", icon: "receipt", needs: "expenses.manage" },
  { href: "/money", label: "Money", icon: "wallet", needs: "finance.view" },
  { href: "/payroll", label: "Payroll", icon: "banknote", needs: "payroll.prepare" },
  { href: "/reports", label: "Reports", icon: "chart", needs: "finance.view" },
  { href: "/settings", label: "Settings", icon: "settings", needs: "settings.manage" },
];

export function navFor(role: string) {
  return ITEMS.filter((item) => !item.needs || can(role, item.needs));
}

/** The four phone tabs around the centre Add button; everything else sits under More. */
export function dockFor(role: string) {
  const money = can(role, "finance.view") ? "/money" : can(role, "sales.manage") ? "/sales" : "/health";
  return ["/today", "/flocks", money];
}

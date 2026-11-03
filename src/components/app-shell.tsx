"use client";

import { Banknote, Bird, Boxes, ChartLine, Ellipsis, LogOut, Moon, Plus, ReceiptText, Settings, ShoppingBasket, Sun, SunMedium, Syringe, Users, Wallet, Warehouse, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { changeSite, signOut } from "@/app/actions/auth";
import { Logo } from "@/components/logo";
import { SyncStatus } from "@/components/sync-status";
import { clearDevice } from "@/lib/offline";
import type { NavItem } from "@/lib/navigation";

const ICONS: Record<string, LucideIcon> = {
  sun: SunMedium,
  bird: Bird,
  syringe: Syringe,
  boxes: Boxes,
  warehouse: Warehouse,
  users: Users,
  shopping: ShoppingBasket,
  wallet: Wallet,
  banknote: Banknote,
  receipt: ReceiptText,
  chart: ChartLine,
  settings: Settings,
};

export function SignOutButton({ className }: { className: string }) {
  return (
    <form action={signOut} onSubmit={() => void clearDevice()}>
      <button className={className}>
        <LogOut size={18} aria-hidden /> Sign out
      </button>
    </form>
  );
}

function ThemeToggle() {
  function toggle() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
  }
  return (
    <button type="button" onClick={toggle} aria-label="Switch light or dark mode" className="grid h-10 w-10 place-items-center rounded-xl text-ink-soft hover:bg-raised">
      <Moon size={19} className="dark:hidden" />
      <Sun size={19} className="hidden dark:block" />
    </button>
  );
}

function SiteSwitcher({ farms, site }: { farms: { id: string; name: string }[]; site: string }) {
  const form = useRef<HTMLFormElement>(null);
  if (farms.length < 2) return null;
  return (
    <form ref={form} action={changeSite}>
      <select name="farmId" defaultValue={site} aria-label="Choose site" onChange={() => form.current?.requestSubmit()} className="h-10 w-full max-w-48 rounded-xl border border-line bg-surface px-2 text-sm text-ink">
        <option value="">All sites</option>
        {farms.map((farm) => (
          <option key={farm.id} value={farm.id}>
            {farm.name}
          </option>
        ))}
      </select>
    </form>
  );
}

export function AppShell({ nav, dock, user, farms, site, children }: { nav: NavItem[]; dock: string[]; user: { name: string; role: string }; farms: { id: string; name: string }[]; site: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = (href: string) => path === href || path.startsWith(`${href}/`);
  const tabs = dock.map((href) => nav.find((item) => item.href === href)!);

  return (
    <div className="md:pl-64">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-line bg-surface p-4 md:flex">
        <div className="px-2 py-3">
          <Logo />
        </div>
        <Link href="/add" className="btn-yolk my-4">
          <Plus size={18} /> Add record
        </Link>
        <nav className="flex-1 space-y-1 overflow-y-auto" aria-label="Main">
          {nav.map((item) => {
            const Icon = ICONS[item.icon];
            return (
              <Link key={item.href} href={item.href} aria-current={active(item.href) ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium ${active(item.href) ? "bg-brand-soft text-brand" : "text-ink-soft hover:bg-raised"}`}>
                <Icon size={19} aria-hidden /> {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-3 border-t border-line pt-3">
          <p className="truncate px-2 text-sm font-semibold">{user.name}</p>
          <p className="px-2 text-xs capitalize text-ink-faint">{user.role.toLowerCase()}</p>
          <SignOutButton className="mt-2 flex min-h-10 w-full items-center gap-3 rounded-xl px-2 text-sm text-ink-soft hover:bg-raised" />

        </div>
      </aside>

      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-canvas/90 px-4 py-2 backdrop-blur md:px-8">
        <div className="md:hidden">
          <Logo />
        </div>
        <div className="hidden md:block">
          <SiteSwitcher farms={farms} site={site} />
        </div>
        <div className="flex items-center gap-1">
          <SyncStatus />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 md:px-8 md:pb-10">
        <div className="mb-4 md:hidden">
          <SiteSwitcher farms={farms} site={site} />
        </div>
        {children}
      </main>

      <nav aria-label="Quick" className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface md:hidden">
        <div className="grid grid-cols-5 items-center">
          {tabs.slice(0, 2).map((item) => (
            <DockTab key={item.href} item={item} active={active(item.href)} />
          ))}
          <div className="grid place-items-center">
            <Link href="/add" aria-label="Add record" className="-mt-7 grid h-16 w-16 place-items-center rounded-[45%_45%_50%_50%/55%_55%_45%_45%] bg-yolk text-yolk-ink shadow-dock">
              <Plus size={28} />
            </Link>
          </div>
          <DockTab item={tabs[2]} active={active(tabs[2].href)} />
          <DockTab item={{ href: "/more", label: "More", icon: "" }} active={active("/more")} />
        </div>
      </nav>
    </div>
  );
}

function DockTab({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = ICONS[item.icon] ?? Ellipsis;
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${active ? "text-brand" : "text-ink-faint"}`}>
      <Icon size={22} aria-hidden /> {item.label}
    </Link>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; group: string };

export default function AdminNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const groups = [...new Set(items.map((i) => i.group))];
  const isActive = (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(href + "/"));
  return (
    <nav className="adm-nav" aria-label="Yönetim menüsü">
      {groups.map((g) => (
        <div key={g} style={{ display: "contents" }}>
          <div className="adm-nav-group">{g}</div>
          {items
            .filter((i) => i.group === g)
            .map((i) => (
              <Link key={i.href} href={i.href} aria-current={isActive(i.href) ? "page" : undefined}>
                {i.label}
              </Link>
            ))}
        </div>
      ))}
    </nav>
  );
}

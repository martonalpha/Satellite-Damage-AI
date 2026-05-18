"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const navItems: { href: string; label: string }[] = [];

export function AppNavbar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <header className="fixed inset-x-0 top-0 z-30 bg-transparent font-mono">
      <nav className="mx-auto flex min-h-[56px] w-full max-w-[1900px] items-center justify-end gap-4 px-20 sm:px-24 lg:px-28">
        {navItems.map((item) => {
          const active = isActiveNavItem(item.href, pathname, searchParams);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`text-[13px] font-black uppercase tracking-normal transition ${
                active
                  ? "text-[var(--text-primary)]"
                  : "text-[var(--text-primary)] hover:text-[var(--text-muted)]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

function isActiveNavItem(
  href: string,
  pathname: string,
  searchParams: URLSearchParams,
) {
  const [hrefPath, hrefQuery] = href.split("?");

  if (pathname !== hrefPath) {
    return false;
  }

  if (!hrefQuery) {
    return true;
  }

  const expected = new URLSearchParams(hrefQuery);

  for (const [key, value] of expected.entries()) {
    if (searchParams.get(key) !== value) {
      return false;
    }
  }

  return true;
}

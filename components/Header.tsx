"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FaGithub, FaTwitter } from "react-icons/fa";

const NAV_LINKS = [
  { href: "/", label: "Search" },
  { href: "/similarity", label: "Similarity Search" },
] as const;

const SOCIAL_LINKS = [
  {
    href: "https://github.com/The-Memechanic/FN-jam-track-retrieval",
    label: "GitHub",
    icon: FaGithub,
  },
  {
    href: "https://twitter.com/Memechanic",
    label: "Twitter",
    icon: FaTwitter,
  },
] as const;

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-border-muted bg-bg-dark/80 backdrop-blur">
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 px-4 py-3">
        {/* Left: Title */}
        <Link
          href="/"
          scroll={false}
          className="col-start-1 row-start-1 justify-self-start whitespace-nowrap text-lg font-semibold tracking-tight text-text"
        >
          FestivalDB
        </Link>

        {/* Center: Navigation */}
        <nav className="col-start-2 row-start-1 flex min-w-max items-center justify-self-center gap-1 whitespace-nowrap rounded-lg border border-border-muted bg-bg-light p-1">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                scroll={false}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-primary text-bg-dark"
                    : "text-text-muted hover:bg-bg-dark hover:text-text"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right: Social links */}
        <div className="col-start-3 row-start-1 flex items-center justify-self-end gap-1">
          {SOCIAL_LINKS.map((social) => {
            const Icon = social.icon;

            return (
              <Link
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={social.label}
                className="rounded-md p-2 text-text-muted transition hover:bg-bg-light hover:text-text"
              >
                <Icon size={18} />
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
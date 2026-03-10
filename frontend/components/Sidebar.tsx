"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function DashboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: <DashboardIcon /> },
  { href: "/report", label: "New Report", icon: <ReportIcon /> },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      <aside className="hidden md:flex w-72 shrink-0 border-r border-slate-200 bg-[#0b2138] text-slate-200 min-h-screen sticky top-0 flex-col">
        <div className="px-6 py-6 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-300/40 flex items-center justify-center text-teal-200">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="3 11 22 2 13 21 11 13 3 11" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-white text-sm">CivicAI Console</p>
              <p className="text-xs text-slate-400">Urban issue management</p>
            </div>
          </div>
        </div>

        <nav className="p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 px-3 pb-2">Workspace</p>
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm transition ${
                  active
                    ? "bg-teal-400/15 text-teal-100 border border-teal-300/30"
                    : "text-slate-300 hover:bg-slate-700/30 hover:text-white"
                }`}
              >
                <span className={active ? "text-teal-200" : "text-slate-400"}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto p-4">
          <div className="rounded-2xl border border-slate-700/60 bg-slate-800/60 p-4">
            <p className="text-xs text-slate-400">Service status</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-sm text-emerald-200">System online</span>
            </div>
          </div>
        </div>
      </aside>

      <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="grid grid-cols-2 gap-2 p-2">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-teal-600 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-[18px] h-[18px]" /> },
  { href: "/report", label: "New Report", icon: <FileText className="w-[18px] h-[18px]" /> },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      <aside className="hidden md:flex w-72 shrink-0 border-r border-slate-800 bg-slate-900 text-slate-200 min-h-screen sticky top-0 flex-col transition-all duration-300">
        <div className="px-6 py-8 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/30 shadow-[0_0_15px_rgba(20,184,166,0.15)] flex items-center justify-center text-teal-300 transition-all hover:bg-teal-500/30">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="3 11 22 2 13 21 11 13 3 11" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-white tracking-wide">CivicAI Console</p>
              <p className="text-xs text-slate-400 mt-0.5">Urban issue management</p>
            </div>
          </div>
        </div>

        <nav className="p-4 space-y-1.5 flex-1">
          <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 px-3 pb-3">Workspace</p>
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-3.5 rounded-xl px-3.5 py-3 text-sm transition-all duration-200 ${
                  active
                    ? "bg-teal-500/10 text-teal-50 border border-teal-500/20 shadow-sm"
                    : "text-slate-400 border border-transparent hover:bg-slate-800/60 hover:text-slate-200 hover:border-slate-700/50"
                }`}
              >
                <span className={`transition-colors duration-200 ${active ? "text-teal-400" : "text-slate-500 group-hover:text-slate-300"}`}>
                  {item.icon}
                </span>
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto p-5">
          <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-4 transition-colors hover:bg-slate-800/60">
            <p className="text-xs font-medium text-slate-400 mb-2.5">System Status</p>
            <div className="flex items-center gap-2.5 bg-slate-900/50 rounded-lg p-2 border border-slate-800/80">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-medium text-emerald-400/90 tracking-wide">AI Engine Online</span>
            </div>
          </div>
        </div>
      </aside>

      <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t border-slate-200/60 bg-white/80 backdrop-blur-xl shadow-[0_-5px_20px_-15px_rgba(0,0,0,0.1)]">
        <div className="flex items-center justify-around p-2">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl py-2 px-6 transition-all duration-200 ${
                  active
                    ? "text-teal-700 bg-teal-50/50"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div className={`${active ? "scale-110" : "scale-100"} transition-transform duration-200`}>
                  {item.icon}
                </div>
                <span className="text-[10px] font-semibold tracking-wide">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

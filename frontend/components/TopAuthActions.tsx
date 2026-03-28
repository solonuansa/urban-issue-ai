"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { clearAuthSession, getAuthUser, type AuthUser } from "@/lib/auth";

export default function TopAuthActions() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(getAuthUser());
  }, [pathname]);

  useEffect(() => {
    const sync = () => setUser(getAuthUser());
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  const handleLogout = () => {
    clearAuthSession();
    setUser(null);
    router.push("/login");
  };

  if (pathname === "/login") {
    return null;
  }

  return (
    <div className="sticky top-0 z-20 px-3 pt-2 md:px-8 md:pt-4 flex justify-end pointer-events-none">
      {user ? (
        <div className="pointer-events-auto inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/95 backdrop-blur px-2 py-1.5 shadow-sm">
          <p className="hidden md:block text-[11px] text-slate-500">
            {user.full_name}
          </p>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      ) : (
        <Link
          href="/login"
          className="pointer-events-auto inline-flex items-center rounded-md border border-slate-300 bg-white/95 backdrop-blur px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
        >
          Sign In
        </Link>
      )}
    </div>
  );
}

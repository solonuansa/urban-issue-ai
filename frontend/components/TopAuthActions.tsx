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
    <div className="px-4 pt-4 md:px-8 md:pt-6 flex justify-end">
      {user ? (
        <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
          <p className="hidden md:block text-[11px] text-slate-500">
            {user.full_name}
          </p>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>
      ) : (
        <Link
          href="/login"
          className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          Sign In
        </Link>
      )}
    </div>
  );
}

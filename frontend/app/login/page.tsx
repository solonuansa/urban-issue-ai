"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { setAuthSession } from "@/lib/auth";
import { login, register } from "@/services/api";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"citizen" | "operator" | "admin">("citizen");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === "register") {
        await register({
          full_name: fullName,
          email,
          password,
          role,
        });
      }

      const res = await login({ email, password });
      setAuthSession(res.access_token, res.user);
      router.push(res.user.role === "citizen" ? "/report" : "/dashboard");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="app-card w-full max-w-md p-6 md:p-7">
        <p className="app-section-title">{mode === "login" ? "Sign In" : "Create Account"}</p>
        <h1 className="text-2xl font-semibold text-slate-900">
          {mode === "login" ? "Welcome back" : "Register new user"}
        </h1>
        <p className="text-sm text-slate-500 mt-2">
          Use operator/admin role for dashboard workflow features.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          {mode === "register" && (
            <div>
              <label className="text-xs font-semibold text-slate-600">Full name</label>
              <input className="app-input w-full mt-1" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-600">Email</label>
            <input
              className="app-input w-full mt-1"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Password</label>
            <input
              className="app-input w-full mt-1"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          {mode === "register" && (
            <div>
              <label className="text-xs font-semibold text-slate-600">Role</label>
              <select className="app-input w-full mt-1" value={role} onChange={(e) => setRole(e.target.value as "citizen" | "operator" | "admin")}>
                <option value="citizen">Citizen</option>
                <option value="operator">Operator</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-teal-700 text-white py-3 text-sm font-semibold hover:bg-teal-800 disabled:opacity-60"
          >
            {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Register & Sign In"}
          </button>
        </form>

        <div className="mt-5 flex items-center justify-between text-xs text-slate-500">
          <button
            className="font-semibold text-teal-700 hover:underline"
            onClick={() => setMode((prev) => (prev === "login" ? "register" : "login"))}
          >
            {mode === "login" ? "Need account? Register" : "Already have account? Sign in"}
          </button>
          <Link href="/report" className="hover:underline">Continue as guest page</Link>
        </div>
      </div>
    </div>
  );
}

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

  const fillDemoAccount = (nextEmail: string) => {
    setEmail(nextEmail);
    setPassword("Demo12345!");
    setError(null);
  };

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
    <div className="min-h-screen px-4 py-8 md:px-8 lg:grid lg:place-items-center">
      <div className="mx-auto grid w-full max-w-5xl items-center gap-6 lg:grid-cols-2">
        <section className="h-full rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 p-7 text-white md:p-10 flex flex-col justify-center">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl border border-teal-400/40 bg-teal-400/10 text-teal-200 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 15l4-4 3 3 6-6 3 3" />
                <path d="M4 20h16" />
              </svg>
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-100">Urban Issue AI</p>
          </div>
          <h1 className="mt-6 text-3xl font-semibold leading-tight md:text-4xl">Urban Issue AI</h1>
          <p className="mt-3 text-sm text-slate-300 max-w-md">
            Platform pelaporan isu kota dengan prioritas berbasis AI, peta risiko area, dan workflow operasional terintegrasi.
          </p>
          <div className="mt-6 inline-flex items-center rounded-full border border-slate-600/70 px-3 py-1 text-[11px] font-semibold text-slate-300">
            Smart reporting. Faster response.
          </div>
        </section>

        <section className="app-card w-full p-6 md:p-7 lg:p-8">
          <p className="app-section-title">{mode === "login" ? "Sign In" : "Create Account"}</p>
          <h2 className="text-2xl font-semibold text-slate-900">
            {mode === "login" ? "Welcome back" : "Register new user"}
          </h2>
          <p className="text-sm text-slate-500 mt-2">
            Use operator/admin role for dashboard workflow features.
          </p>
          {mode === "login" && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <p className="font-semibold text-slate-700">Demo accounts</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fillDemoAccount("admin.demo@urban-issue.ai")}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Use Demo Admin
                </button>
                <button
                  type="button"
                  onClick={() => fillDemoAccount("operator.demo@urban-issue.ai")}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Use Demo Operator
                </button>
                <button
                  type="button"
                  onClick={() => fillDemoAccount("citizen.demo@urban-issue.ai")}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Use Demo Citizen
                </button>
              </div>
            </div>
          )}

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
        </section>
      </div>
    </div>
  );
}

import Link from "next/link";
import ReportForm from "@/components/ReportForm";

export default function ReportPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 md:px-8 md:py-8">
      <div className="app-card p-5 md:p-7 mb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-3"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Back to dashboard
            </Link>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">Create New Report</h1>
            <p className="text-sm text-slate-500 mt-2 max-w-2xl">
              Upload evidence, mark the exact location, and choose road context. The system will classify severity and assign priority automatically.
            </p>
          </div>
          <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800 w-full md:w-auto">
            <p className="font-semibold">Submission checklist</p>
            <p className="text-xs mt-1">Photo + location + road type are required.</p>
          </div>
        </div>
      </div>

      <ReportForm />
    </div>
  );
}

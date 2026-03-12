import { getAuthToken, type AuthUser } from "@/lib/auth";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface SubmitReportPayload {
  image: File;
  latitude: number;
  longitude: number;
  location_importance: number;
}

export type PriorityLabel = "HIGH" | "MEDIUM" | "LOW";
export type ReportStatus = "NEW" | "IN_REVIEW" | "IN_PROGRESS" | "RESOLVED" | "REJECTED";

export interface ReportData {
  id: number;
  issue_type: string;
  severity_level: string;
  urgency_score: number;
  priority_label: PriorityLabel;
  latitude: number;
  longitude: number;
  image_url?: string;
  auto_response: string;
  status: ReportStatus;
  created_by_user_id?: number | null;
  assigned_to_user_id?: number | null;
  resolution_note?: string | null;
  resolved_at?: string | null;
  updated_at?: string | null;
  created_at: string;
  cv_confidence?: number;
}

export interface SubmitReportResponse {
  message: string;
  data: ReportData;
}

export interface GetReportsResponse {
  reports: ReportData[];
}

export interface GetReportResponse {
  report: ReportData;
}

export interface AuthResponse {
  access_token: string;
  token_type: "bearer";
  user: AuthUser;
}

export interface MeResponse {
  user: AuthUser & { created_at: string };
}

export interface ReportMetricsResponse {
  summary: {
    total_reports: number;
    status_counts: Record<ReportStatus, number>;
    priority_counts: Record<PriorityLabel, number>;
  };
  trend_14d: Array<{
    date: string;
    incoming: number;
    resolved: number;
  }>;
}

type ApiErrorPayload = {
  detail?: string;
  message?: string;
};

async function parseApiError(res: Response): Promise<never> {
  let payload: ApiErrorPayload | null = null;
  try {
    payload = (await res.json()) as ApiErrorPayload;
  } catch {
    payload = null;
  }

  const message = payload?.detail ?? payload?.message ?? `API error: ${res.status} ${res.statusText}`;
  throw new Error(message);
}

function withAuth(headers: HeadersInit = {}): HeadersInit {
  const token = getAuthToken();
  if (!token) return headers;
  return {
    ...headers,
    Authorization: `Bearer ${token}`,
  };
}

export function getPublicImageUrl(imageUrl?: string): string | undefined {
  if (!imageUrl) return undefined;
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) return imageUrl;
  return `${BASE_URL}${imageUrl}`;
}

export async function register(payload: {
  full_name: string;
  email: string;
  password: string;
  role?: "citizen" | "operator" | "admin";
}): Promise<{ message: string; user: AuthUser & { created_at: string } }> {
  const form = new FormData();
  form.append("full_name", payload.full_name);
  form.append("email", payload.email);
  form.append("password", payload.password);
  form.append("role", payload.role ?? "citizen");

  const res = await fetch(`${BASE_URL}/api/auth/register`, { method: "POST", body: form });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as { message: string; user: AuthUser & { created_at: string } };
}

export async function login(payload: { email: string; password: string }): Promise<AuthResponse> {
  const form = new FormData();
  form.append("email", payload.email);
  form.append("password", payload.password);

  const res = await fetch(`${BASE_URL}/api/auth/login`, { method: "POST", body: form });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as AuthResponse;
}

export async function getMe(): Promise<MeResponse> {
  const res = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: withAuth(),
  });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as MeResponse;
}

export async function submitReport(payload: SubmitReportPayload): Promise<SubmitReportResponse> {
  const form = new FormData();
  form.append("image", payload.image);
  form.append("latitude", String(payload.latitude));
  form.append("longitude", String(payload.longitude));
  form.append("location_importance", String(payload.location_importance));

  const res = await fetch(`${BASE_URL}/api/reports/submit`, {
    method: "POST",
    body: form,
    headers: withAuth(),
  });

  if (!res.ok) await parseApiError(res);
  return (await res.json()) as SubmitReportResponse;
}

export async function getReports(filters?: {
  priority?: PriorityLabel | "ALL";
  status?: ReportStatus | "ALL";
}): Promise<GetReportsResponse> {
  const params = new URLSearchParams();
  if (filters?.priority && filters.priority !== "ALL") params.set("priority", filters.priority);
  if (filters?.status && filters.status !== "ALL") params.set("status", filters.status);
  const suffix = params.toString() ? `?${params.toString()}` : "";

  const res = await fetch(`${BASE_URL}/api/reports/${suffix}`, {
    headers: withAuth(),
  });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as GetReportsResponse;
}

export async function getReport(id: number): Promise<GetReportResponse> {
  const res = await fetch(`${BASE_URL}/api/reports/${id}`, {
    headers: withAuth(),
  });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as GetReportResponse;
}

export async function updateReportStatus(payload: {
  reportId: number;
  status: ReportStatus;
  resolution_note?: string;
  assigned_to_user_id?: number;
}): Promise<{ message: string; report: ReportData }> {
  const form = new FormData();
  form.append("status", payload.status);
  if (payload.resolution_note) form.append("resolution_note", payload.resolution_note);
  if (payload.assigned_to_user_id) form.append("assigned_to_user_id", String(payload.assigned_to_user_id));

  const res = await fetch(`${BASE_URL}/api/reports/${payload.reportId}/status`, {
    method: "PATCH",
    body: form,
    headers: withAuth(),
  });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as { message: string; report: ReportData };
}

export async function getReportMetrics(): Promise<ReportMetricsResponse> {
  const res = await fetch(`${BASE_URL}/api/reports/metrics/summary`, {
    headers: withAuth(),
  });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as ReportMetricsResponse;
}

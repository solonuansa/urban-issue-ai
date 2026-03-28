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
  meta?: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
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
  advanced: {
    mttr_hours: number;
    sla_breached_high: number;
    aging_backlog_over_7d: number;
    resolution_rate_14d: number;
    top_issue_types: Array<{
      issue_type: string;
      count: number;
    }>;
  };
}

export interface OperatorUser {
  id: number;
  full_name: string;
  email: string;
  role: "operator" | "admin";
}

export interface ReportAuditLog {
  id: number;
  report_id: number;
  previous_status?: ReportStatus | null;
  new_status?: ReportStatus | null;
  changed_by_user_id: number;
  assigned_to_user_id?: number | null;
  note?: string | null;
  created_at: string;
}

export interface NotificationItem {
  id: number;
  user_id: number;
  title: string;
  body: string;
  type: string;
  related_report_id?: number | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  notifications: NotificationItem[];
  unread_count: number;
  meta: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

export interface SavedDashboardViewPayload {
  priority: "ALL" | "HIGH" | "MEDIUM" | "LOW";
  status: "ALL" | "NEW" | "IN_REVIEW" | "IN_PROGRESS" | "RESOLVED" | "REJECTED";
  search: string;
  hotspot_days: number;
  hotspot_mode: "OPEN" | "ALL" | "HIGH";
  hotspot_risk: "ALL" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface SavedDashboardView {
  id: number;
  name: string;
  payload: SavedDashboardViewPayload;
  created_at: string;
  updated_at: string;
}

export interface SlaHighItem extends ReportData {
  age_hours: number;
  sla_due_at: string;
  is_breached: boolean;
}

export interface HotspotItem {
  lat: number;
  lng: number;
  count: number;
  high_count: number;
  open_count: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  risk_score: number;
}

export interface HotspotRiskPolicy {
  source: "env_default" | "db_override";
  weights: {
    total: number;
    high: number;
    open: number;
  };
  score_min: {
    medium: number;
    high: number;
    critical: number;
  };
  count_min: {
    medium: number;
    high: number;
    critical: number;
    critical_high_count: number;
  };
}

export interface HotspotAreaSegment {
  area_id: string;
  area_name: string;
  city: string;
  hotspot_count: number;
  report_count: number;
  high_count: number;
  open_count: number;
  risk_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

type ApiErrorPayload = {
  detail?: string;
  message?: string;
};

function formatNetworkErrorMessage(): string {
  return `Tidak bisa terhubung ke server API (${BASE_URL}). Pastikan backend berjalan dan NEXT_PUBLIC_API_URL sudah benar.`;
}

async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Permintaan ke server dibatalkan karena timeout.");
    }
    if (error instanceof TypeError) {
      throw new Error(formatNetworkErrorMessage());
    }
    throw error instanceof Error ? error : new Error("Gagal menghubungi server.");
  }
}

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

export async function checkBackendHealth(): Promise<{ status: string }> {
  const res = await apiFetch(`${BASE_URL}/healthz`);
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as { status: string };
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

  const res = await apiFetch(`${BASE_URL}/api/auth/register`, { method: "POST", body: form });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as { message: string; user: AuthUser & { created_at: string } };
}

export async function login(payload: { email: string; password: string }): Promise<AuthResponse> {
  const form = new FormData();
  form.append("email", payload.email);
  form.append("password", payload.password);

  const res = await apiFetch(`${BASE_URL}/api/auth/login`, { method: "POST", body: form });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as AuthResponse;
}

export async function getMe(): Promise<MeResponse> {
  const res = await apiFetch(`${BASE_URL}/api/auth/me`, {
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

  const res = await apiFetch(`${BASE_URL}/api/reports/submit`, {
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
  search?: string;
  page?: number;
  page_size?: number;
}): Promise<GetReportsResponse> {
  const params = new URLSearchParams();
  if (filters?.priority && filters.priority !== "ALL") params.set("priority", filters.priority);
  if (filters?.status && filters.status !== "ALL") params.set("status", filters.status);
  if (filters?.search?.trim()) params.set("search", filters.search.trim());
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.page_size) params.set("page_size", String(filters.page_size));
  const suffix = params.toString() ? `?${params.toString()}` : "";

  const res = await apiFetch(`${BASE_URL}/api/reports/${suffix}`, {
    headers: withAuth(),
  });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as GetReportsResponse;
}

export async function getReport(id: number): Promise<GetReportResponse> {
  const res = await apiFetch(`${BASE_URL}/api/reports/${id}`, {
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

  const res = await apiFetch(`${BASE_URL}/api/reports/${payload.reportId}/status`, {
    method: "PATCH",
    body: form,
    headers: withAuth(),
  });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as { message: string; report: ReportData };
}

export async function getOperators(): Promise<{ operators: OperatorUser[] }> {
  const res = await apiFetch(`${BASE_URL}/api/reports/operators`, {
    headers: withAuth(),
  });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as { operators: OperatorUser[] };
}

export async function assignReportOperator(payload: {
  reportId: number;
  assigned_to_user_id: number;
  note?: string;
}): Promise<{ message: string; report: ReportData }> {
  const form = new FormData();
  form.append("assigned_to_user_id", String(payload.assigned_to_user_id));
  if (payload.note) form.append("note", payload.note);

  const res = await apiFetch(`${BASE_URL}/api/reports/${payload.reportId}/assign`, {
    method: "PATCH",
    headers: withAuth(),
    body: form,
  });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as { message: string; report: ReportData };
}

export async function getReportAuditLogs(reportId: number): Promise<{ logs: ReportAuditLog[] }> {
  const res = await apiFetch(`${BASE_URL}/api/reports/${reportId}/audit`, {
    headers: withAuth(),
  });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as { logs: ReportAuditLog[] };
}

export async function getReportMetrics(): Promise<ReportMetricsResponse> {
  const res = await apiFetch(`${BASE_URL}/api/reports/metrics/summary`, {
    headers: withAuth(),
  });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as ReportMetricsResponse;
}

export async function exportReportMetricsCsv(): Promise<Blob> {
  const res = await apiFetch(`${BASE_URL}/api/reports/metrics/export.csv`, {
    headers: withAuth(),
  });
  if (!res.ok) await parseApiError(res);
  return await res.blob();
}

export async function getSlaHighBoard(): Promise<{ items: SlaHighItem[] }> {
  const res = await apiFetch(`${BASE_URL}/api/reports/metrics/sla/high`, {
    headers: withAuth(),
  });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as { items: SlaHighItem[] };
}

export async function getHotspots(params?: {
  days?: number;
  status?: "OPEN" | ReportStatus;
  priority?: PriorityLabel;
  grid_size?: number;
}): Promise<{
  hotspots: HotspotItem[];
  meta: {
    days: number;
    grid_size: number;
    total_reports: number;
    total_hotspots: number;
    risk_policy?: HotspotRiskPolicy;
  };
}> {
  const query = new URLSearchParams();
  if (params?.days) query.set("days", String(params.days));
  if (params?.status) query.set("status", params.status);
  if (params?.priority) query.set("priority", params.priority);
  if (params?.grid_size) query.set("grid_size", String(params.grid_size));
  const suffix = query.toString() ? `?${query.toString()}` : "";

  const res = await apiFetch(`${BASE_URL}/api/reports/metrics/hotspots${suffix}`, {
    headers: withAuth(),
  });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as {
    hotspots: HotspotItem[];
    meta: {
      days: number;
      grid_size: number;
      total_reports: number;
      total_hotspots: number;
      risk_policy?: HotspotRiskPolicy;
    };
  };
}

export async function getHotspotRiskPolicy(): Promise<{ policy: HotspotRiskPolicy }> {
  const res = await apiFetch(`${BASE_URL}/api/reports/metrics/hotspots/policy`, {
    headers: withAuth(),
  });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as { policy: HotspotRiskPolicy };
}

export async function updateHotspotRiskPolicy(payload: {
  weight_total: number;
  weight_high: number;
  weight_open: number;
  medium_score_min: number;
  high_score_min: number;
  critical_score_min: number;
  medium_count_min: number;
  high_count_min: number;
  critical_count_min: number;
  critical_high_count_min: number;
}): Promise<{ message: string; policy: HotspotRiskPolicy }> {
  const res = await apiFetch(`${BASE_URL}/api/reports/metrics/hotspots/policy`, {
    method: "PATCH",
    headers: {
      ...withAuth(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as { message: string; policy: HotspotRiskPolicy };
}

export async function getHotspotReports(params: {
  lat: number;
  lng: number;
  days?: number;
  status?: "OPEN" | ReportStatus;
  priority?: PriorityLabel;
  grid_size?: number;
  limit?: number;
}): Promise<{
  reports: ReportData[];
  meta: {
    lat: number;
    lng: number;
    grid_size: number;
    days: number;
    count: number;
  };
}> {
  const query = new URLSearchParams();
  query.set("lat", String(params.lat));
  query.set("lng", String(params.lng));
  if (params.days) query.set("days", String(params.days));
  if (params.status) query.set("status", params.status);
  if (params.priority) query.set("priority", params.priority);
  if (params.grid_size) query.set("grid_size", String(params.grid_size));
  if (params.limit) query.set("limit", String(params.limit));

  const res = await apiFetch(`${BASE_URL}/api/reports/metrics/hotspots/reports?${query.toString()}`, {
    headers: withAuth(),
  });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as {
    reports: ReportData[];
    meta: { lat: number; lng: number; grid_size: number; days: number; count: number };
  };
}

export async function getHotspotAreaSegments(params?: {
  days?: number;
  status?: "OPEN" | ReportStatus;
  priority?: PriorityLabel;
  grid_size?: number;
}): Promise<{
  areas: HotspotAreaSegment[];
  meta: {
    days: number;
    grid_size: number;
    total_areas: number;
    risk_policy?: HotspotRiskPolicy;
  };
}> {
  const query = new URLSearchParams();
  if (params?.days) query.set("days", String(params.days));
  if (params?.status) query.set("status", params.status);
  if (params?.priority) query.set("priority", params.priority);
  if (params?.grid_size) query.set("grid_size", String(params.grid_size));
  const suffix = query.toString() ? `?${query.toString()}` : "";

  const res = await apiFetch(`${BASE_URL}/api/reports/metrics/hotspots/areas${suffix}`, {
    headers: withAuth(),
  });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as {
    areas: HotspotAreaSegment[];
    meta: {
      days: number;
      grid_size: number;
      total_areas: number;
      risk_policy?: HotspotRiskPolicy;
    };
  };
}

export async function getCitizenHotspots(params?: {
  days?: number;
  issue_type?: "pothole" | "all";
  grid_size?: number;
}): Promise<{
  hotspots: HotspotItem[];
  meta: {
    days: number;
    issue_type: string;
    grid_size: number;
    total_hotspots: number;
    critical_areas: number;
    high_areas: number;
    risk_policy: HotspotRiskPolicy;
  };
  advisory: {
    headline: string;
    tips: string[];
  };
}> {
  const query = new URLSearchParams();
  if (params?.days) query.set("days", String(params.days));
  if (params?.issue_type) query.set("issue_type", params.issue_type);
  if (params?.grid_size) query.set("grid_size", String(params.grid_size));
  const suffix = query.toString() ? `?${query.toString()}` : "";

  const res = await apiFetch(`${BASE_URL}/api/reports/public/hotspots${suffix}`, {
    headers: withAuth(),
  });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as {
    hotspots: HotspotItem[];
    meta: {
      days: number;
      issue_type: string;
      grid_size: number;
      total_hotspots: number;
      critical_areas: number;
      high_areas: number;
      risk_policy: HotspotRiskPolicy;
    };
    advisory: {
      headline: string;
      tips: string[];
    };
  };
}

export async function getCitizenNearbyRisk(params: {
  latitude: number;
  longitude: number;
  radius_km?: number;
  days?: number;
  issue_type?: "pothole" | "all";
  limit?: number;
}): Promise<{
  meta: {
    latitude: number;
    longitude: number;
    radius_km: number;
    days: number;
    issue_type: string;
    count: number;
    risk_level: "LOW" | "MEDIUM" | "HIGH";
    risk_score: number;
    alert: {
      should_alert: boolean;
      level: "LOW" | "MEDIUM" | "HIGH";
      message: string;
      cooldown_minutes: number;
      near_high_priority: number;
      reasons: string[];
    };
    alert_policy: {
      medium_score_min: number;
      high_score_min: number;
      medium_count_min: number;
      high_count_min: number;
      high_priority_near_min: number;
      cooldown_medium_min: number;
      cooldown_high_min: number;
    };
  };
  items: Array<{
    id: number;
    issue_type: string;
    priority_label: "HIGH" | "MEDIUM" | "LOW";
    status: "NEW" | "IN_REVIEW" | "IN_PROGRESS" | "RESOLVED" | "REJECTED";
    latitude: number;
    longitude: number;
    distance_km: number;
    risk_score: number;
  }>;
}> {
  const query = new URLSearchParams();
  query.set("latitude", String(params.latitude));
  query.set("longitude", String(params.longitude));
  if (params.radius_km) query.set("radius_km", String(params.radius_km));
  if (params.days) query.set("days", String(params.days));
  if (params.issue_type) query.set("issue_type", params.issue_type);
  if (params.limit) query.set("limit", String(params.limit));

  const res = await apiFetch(`${BASE_URL}/api/reports/public/nearby-risk?${query.toString()}`, {
    headers: withAuth(),
  });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as {
    meta: {
      latitude: number;
      longitude: number;
      radius_km: number;
      days: number;
      issue_type: string;
      count: number;
      risk_level: "LOW" | "MEDIUM" | "HIGH";
      risk_score: number;
      alert: {
        should_alert: boolean;
        level: "LOW" | "MEDIUM" | "HIGH";
        message: string;
        cooldown_minutes: number;
        near_high_priority: number;
        reasons: string[];
      };
      alert_policy: {
        medium_score_min: number;
        high_score_min: number;
        medium_count_min: number;
        high_count_min: number;
        high_priority_near_min: number;
        cooldown_medium_min: number;
        cooldown_high_min: number;
      };
    };
    items: Array<{
      id: number;
      issue_type: string;
      priority_label: "HIGH" | "MEDIUM" | "LOW";
      status: "NEW" | "IN_REVIEW" | "IN_PROGRESS" | "RESOLVED" | "REJECTED";
      latitude: number;
      longitude: number;
      distance_km: number;
      risk_score: number;
    }>;
  };
}

export async function getCitizenHotspotTrend(params?: {
  days?: number;
  issue_type?: "pothole" | "all";
}): Promise<{
  meta: { days: number; issue_type: string };
  trend: Array<{ date: string; incoming: number; high_priority: number }>;
}> {
  const query = new URLSearchParams();
  if (params?.days) query.set("days", String(params.days));
  if (params?.issue_type) query.set("issue_type", params.issue_type);
  const suffix = query.toString() ? `?${query.toString()}` : "";

  const res = await apiFetch(`${BASE_URL}/api/reports/public/hotspots/trend${suffix}`, {
    headers: withAuth(),
  });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as {
    meta: { days: number; issue_type: string };
    trend: Array<{ date: string; incoming: number; high_priority: number }>;
  };
}

export async function getCitizenHotspotAreas(params?: {
  days?: number;
  issue_type?: "pothole" | "all";
  grid_size?: number;
}): Promise<{
  areas: HotspotAreaSegment[];
  meta: {
    days: number;
    issue_type: string;
    grid_size: number;
    total_areas: number;
    risk_policy?: HotspotRiskPolicy;
  };
}> {
  const query = new URLSearchParams();
  if (params?.days) query.set("days", String(params.days));
  if (params?.issue_type) query.set("issue_type", params.issue_type);
  if (params?.grid_size) query.set("grid_size", String(params.grid_size));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const res = await apiFetch(`${BASE_URL}/api/reports/public/hotspots/areas${suffix}`, {
    headers: withAuth(),
  });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as {
    areas: HotspotAreaSegment[];
    meta: {
      days: number;
      issue_type: string;
      grid_size: number;
      total_areas: number;
      risk_policy?: HotspotRiskPolicy;
    };
  };
}

export async function getCitizenRouteSafety(params: {
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  days?: number;
  issue_type?: "pothole" | "all";
  corridor_km?: number;
}): Promise<{
  meta: {
    days: number;
    issue_type: string;
    corridor_km: number;
    candidate_count: number;
  };
  best: {
    rank: number;
    label: string;
    source: string;
    distance_km: number;
    duration_min: number;
    risk_level: "LOW" | "MEDIUM" | "HIGH";
    risk_score: number;
    near_count: number;
    high_count: number;
    maps_url: string;
  } | null;
  routes: Array<{
    rank: number;
    label: string;
    source: string;
    distance_km: number;
    duration_min: number;
    risk_level: "LOW" | "MEDIUM" | "HIGH";
    risk_score: number;
    near_count: number;
    high_count: number;
    maps_url: string;
  }>;
}> {
  const query = new URLSearchParams();
  query.set("start_lat", String(params.start_lat));
  query.set("start_lng", String(params.start_lng));
  query.set("end_lat", String(params.end_lat));
  query.set("end_lng", String(params.end_lng));
  if (params.days) query.set("days", String(params.days));
  if (params.issue_type) query.set("issue_type", params.issue_type);
  if (params.corridor_km) query.set("corridor_km", String(params.corridor_km));
  const res = await apiFetch(`${BASE_URL}/api/reports/public/route-safety?${query.toString()}`, {
    headers: withAuth(),
  });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as {
    meta: {
      days: number;
      issue_type: string;
      corridor_km: number;
      candidate_count: number;
    };
    best: {
      rank: number;
      label: string;
      source: string;
      distance_km: number;
      duration_min: number;
      risk_level: "LOW" | "MEDIUM" | "HIGH";
      risk_score: number;
      near_count: number;
      high_count: number;
      maps_url: string;
    } | null;
    routes: Array<{
      rank: number;
      label: string;
      source: string;
      distance_km: number;
      duration_min: number;
      risk_level: "LOW" | "MEDIUM" | "HIGH";
      risk_score: number;
      near_count: number;
      high_count: number;
      maps_url: string;
    }>;
  };
}

export async function getNotifications(params?: {
  unread_only?: boolean;
  page?: number;
  page_size?: number;
  type?: string;
}): Promise<NotificationListResponse> {
  const query = new URLSearchParams();
  if (params?.unread_only) query.set("unread_only", "true");
  if (params?.page) query.set("page", String(params.page));
  if (params?.page_size) query.set("page_size", String(params.page_size));
  if (params?.type) query.set("type", params.type);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const res = await apiFetch(`${BASE_URL}/api/notifications/${suffix}`, {
    headers: withAuth(),
  });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as NotificationListResponse;
}

export async function markNotificationRead(notificationId: number): Promise<void> {
  const res = await apiFetch(`${BASE_URL}/api/notifications/${notificationId}/read`, {
    method: "PATCH",
    headers: withAuth(),
  });
  if (!res.ok) await parseApiError(res);
}

export async function markAllNotificationsRead(): Promise<void> {
  const res = await apiFetch(`${BASE_URL}/api/notifications/read-all`, {
    method: "PATCH",
    headers: withAuth(),
  });
  if (!res.ok) await parseApiError(res);
}

export async function getSavedDashboardViews(): Promise<{ views: SavedDashboardView[] }> {
  const res = await apiFetch(`${BASE_URL}/api/dashboard-views/`, {
    headers: withAuth(),
  });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as { views: SavedDashboardView[] };
}

export async function createSavedDashboardView(payload: {
  name: string;
  config: SavedDashboardViewPayload;
}): Promise<{ message: string; view: SavedDashboardView }> {
  const form = new FormData();
  form.append("name", payload.name);
  form.append("payload_json", JSON.stringify(payload.config));
  const res = await apiFetch(`${BASE_URL}/api/dashboard-views/`, {
    method: "POST",
    headers: withAuth(),
    body: form,
  });
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as { message: string; view: SavedDashboardView };
}

export async function deleteSavedDashboardView(viewId: number): Promise<void> {
  const res = await apiFetch(`${BASE_URL}/api/dashboard-views/${viewId}`, {
    method: "DELETE",
    headers: withAuth(),
  });
  if (!res.ok) await parseApiError(res);
}

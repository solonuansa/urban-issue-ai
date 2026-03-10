const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface SubmitReportPayload {
  image: File;
  latitude: number;
  longitude: number;
  location_importance: number;
}

export type PriorityLabel = "HIGH" | "MEDIUM" | "LOW";

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

  const message =
    payload?.detail ??
    payload?.message ??
    `API error: ${res.status} ${res.statusText}`;

  throw new Error(message);
}

export async function submitReport(
  payload: SubmitReportPayload
): Promise<SubmitReportResponse> {
  const form = new FormData();
  form.append("image", payload.image);
  form.append("latitude", String(payload.latitude));
  form.append("longitude", String(payload.longitude));
  form.append("location_importance", String(payload.location_importance));

  const res = await fetch(`${BASE_URL}/api/reports/submit`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    await parseApiError(res);
  }

  return (await res.json()) as SubmitReportResponse;
}

export async function getReports(): Promise<GetReportsResponse> {
  const res = await fetch(`${BASE_URL}/api/reports/`);
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as GetReportsResponse;
}

export async function getReport(id: number): Promise<GetReportResponse> {
  const res = await fetch(`${BASE_URL}/api/reports/${id}`);
  if (!res.ok) await parseApiError(res);
  return (await res.json()) as GetReportResponse;
}

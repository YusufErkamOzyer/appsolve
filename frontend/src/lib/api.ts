export interface Service {
  id: number;
  name: string;
  name_en: string;
  slug: string;
  status: "operational" | "degraded" | "outage";
  status_label: string;
  uptime_percentage: number;
  description: string;
  last_incident_at: string | null;
  metadata: Record<string, unknown>;
  active_incident: {
    id: number;
    incident_code: string;
    title: string;
    severity: string | null;
    status: string;
  } | null;
}

export interface IncidentEvent {
  id: number;
  event_type: string;
  actor: string;
  title: string;
  details: string;
  occurred_at: string;
}

export interface Incident {
  id: number;
  incident_code: string;
  title: string;
  severity: "SEV-1" | "SEV-2" | "SEV-3" | null;
  status: "investigating" | "identified" | "monitoring" | "resolved";
  autonomy_mode: "pending_triage" | "full_autonomy" | "approval_required" | "manual_command_only";
  escalation_target: string;
  hypothesis: string | null;
  reasoning: string | null;
  recommended_action_plan?: {
    plan_id?: string;
    title?: string;
    tool_name?: string;
    risk_level?: string;
    steps?: string[];
  } | null;
  sla_deadline: string | null;
  resolved_at: string | null;
  created_at: string;
  service: {
    id: number;
    name: string;
    slug: string;
    status: string;
  };
  events: IncidentEvent[];
}

export interface ServicesResponse {
  system_status: "all_operational" | "partial_outage" | "major_outage";
  system_status_label: string;
  last_synced_at: string;
  services: Service[];
}

export interface IncidentsResponse {
  total_count: number;
  active_count: number;
  incidents: Incident[];
}

export interface TelemetrySignalPayload {
  service_slug: string;
  error_code: string;
  message: string;
  severity?: "SEV-1" | "SEV-2" | "SEV-3";
  metrics?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3001/api/v1";

export async function fetchServices(): Promise<ServicesResponse> {
  const res = await fetch(`${API_BASE}/services`, {
    cache: "no-store",
    headers: { "Content-Type": "application/json" }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch services: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchIncidents(): Promise<IncidentsResponse> {
  const res = await fetch(`${API_BASE}/incidents`, {
    cache: "no-store",
    headers: { "Content-Type": "application/json" }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch incidents: ${res.statusText}`);
  }
  return res.json();
}

export async function sendTelemetrySignal(payload: TelemetrySignalPayload): Promise<unknown> {
  const res = await fetch(`${API_BASE}/telemetry/signals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    throw new Error(`Failed to send telemetry signal: ${res.statusText}`);
  }
  return res.json();
}

export async function resetSystem(): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE}/system/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  if (!res.ok) {
    throw new Error(`Failed to reset system: ${res.statusText}`);
  }
  return res.json();
}

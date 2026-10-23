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

export type EscalationTarget = "none" | "on_call_engineer" | "on_call_and_team_lead";
export type AutonomyMode = "pending_triage" | "full_autonomy" | "approval_required" | "manual_command_only";
export type IncidentSeverity = "SEV-1" | "SEV-2" | "SEV-3";
export type IncidentStatus = "investigating" | "identified" | "monitoring" | "resolved";

export interface RecommendedActionPlan {
  plan_id?: string;
  title?: string;
  tool_name?: string;
  risk_level?: "low" | "medium" | "high" | string;
  steps?: string[];
}

export interface WarRoomMessage {
  id: number;
  sender_type: "gemini_ai_agent" | "engineer" | "system";
  sender_name: string;
  content: string;
  message_type: "text" | "action_card" | "system_diagnostic";
  action_card_payload?: Record<string, unknown>;
  action_status?: string | null;
  created_at: string;
}

export interface PostMortem {
  summary: string;
  root_cause: string;
  duration_seconds: number;
  mttr_formatted: string;
  affected_services: string[];
  action_items: string[];
  generated_by: string;
}

export interface Incident {
  id: number;
  incident_code: string;
  title: string;
  severity: IncidentSeverity | null;
  status: IncidentStatus;
  autonomy_mode: AutonomyMode;
  escalation_target: EscalationTarget;
  hypothesis: string | null;
  reasoning: string | null;
  recommended_action_plan?: RecommendedActionPlan | null;
  raw_payload?: Record<string, unknown>;
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

export interface IncidentDetail extends Incident {
  messages: WarRoomMessage[];
  post_mortem: PostMortem | null;
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
  severity?: IncidentSeverity;
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

export async function fetchIncident(id: number): Promise<IncidentDetail> {
  const res = await fetch(`${API_BASE}/incidents/${id}`, {
    cache: "no-store",
    headers: { "Content-Type": "application/json" }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch incident #${id}: ${res.statusText}`);
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

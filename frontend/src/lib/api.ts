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

export type ActionStatus = "pending" | "autonomous_executed" | "executed" | "plan_approved" | "rejected" | "locked";

export interface ActionCardPayload {
  plan_id?: string;
  title?: string;
  tool_name?: string;
  risk_level?: "low" | "medium" | "high" | string;
  hypothesis?: string | null;
  reasoning?: string | null;
  steps?: string[];
  terminal_output?: string;
  verification_summary?: string;
  executed_at?: string;
  approved_by?: string;
  rejected_by?: string;
  rejection_reason?: string;
  autonomous?: boolean;
  estimated_duration?: string;
  impact_scope?: string;
  guardrail_status?: string;
  plan_stage?: "plan_proposal" | "pr_review" | string;

  // GitHub Remediation fields (R3 / R4)
  github_branch?: string;
  github_branch_url?: string;
  github_pr_number?: number;
  github_pr_url?: string;
  diff_content?: string;
  affected_file?: string;
  merge_status?: 'pending' | 'merged' | 'not_applicable';
  merge_commit_sha?: string;

  // Remote SRE Bridge fields
  sre_bridge_action?: string;
  sre_bridge_status?: string;
  sre_bridge_output?: string;
}

export interface WarRoomMessage {
  id: number;
  sender_type: "gemini_ai_agent" | "engineer" | "system";
  sender_name: string;
  content: string;
  message_type: "text" | "action_card" | "system_diagnostic";
  action_card_payload?: ActionCardPayload;
  action_status?: ActionStatus | null;
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
  created_at?: string;
}

export interface Incident {
  id: number;
  incident_code: string;
  title: string;
  severity: IncidentSeverity | null;
  status: IncidentStatus;
  autonomy_mode: AutonomyMode;
  escalation_target: EscalationTarget;
  ai_stage?: string | null;
  ai_status_text?: string | null;
  jev_triage?: Record<string, unknown> | null;
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
  messages?: WarRoomMessage[];
  post_mortem?: PostMortem | null;
}

export interface IncidentDetail extends Incident {
  messages: WarRoomMessage[];
  post_mortem: PostMortem | null;
}

export interface StatusUpdateItem {
  id: number;
  incident_id: number;
  incident_code?: string;
  severity?: IncidentSeverity | null;
  service_id: number;
  service_name?: string;
  service_slug?: string;
  phase: "investigating" | "identified" | "monitoring" | "resolved" | "autonomous_resolved" | string;
  phase_label: string;
  public_message: string;
  visible_on_status_page: boolean;
  occurred_at: string;
  time_formatted: string;
}

export interface PublicIncidentSummary {
  id: number;
  incident_code: string;
  service_name: string;
  service_slug: string;
  severity: IncidentSeverity | null;
  status: IncidentStatus;
  title: string;
  created_at: string;
  resolved_at: string | null;
  updates: StatusUpdateItem[];
}

export interface ServicesResponse {
  system_status: "all_operational" | "partial_outage" | "major_outage";
  system_status_label: string;
  system_status_description?: string;
  last_synced_at: string;
  services: Service[];
  status_updates?: StatusUpdateItem[];
}

export interface StatusPageResponse {
  system_status: "all_operational" | "partial_outage" | "major_outage";
  system_status_label: string;
  system_status_description: string;
  last_synced_at: string;
  meta: {
    app_name: string;
    version: string;
    poll_interval_seconds: number;
    mobile_client_support: boolean;
    telemetry_endpoint: string;
  };
  services: Service[];
  status_updates: StatusUpdateItem[];
  active_incidents: PublicIncidentSummary[];
  recent_incidents: PublicIncidentSummary[];
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

export async function fetchStatusPage(): Promise<StatusPageResponse> {
  const res = await fetch(`${API_BASE}/status_page`, {
    cache: "no-store",
    headers: { "Content-Type": "application/json" }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch status page: ${res.statusText}`);
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

export interface AiAutomationStatus {
  ai_connected: boolean;
  mode: "autonomous" | "paused";
  label: string;
  token_saving_active: boolean;
  message?: string;
  updated_at?: string;
}

export async function fetchAiStatus(): Promise<AiAutomationStatus> {
  const res = await fetch(`${API_BASE}/system/ai_status`, {
    cache: "no-store",
    headers: { "Content-Type": "application/json" }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch AI status: ${res.statusText}`);
  }
  return res.json();
}

export async function toggleAiStatus(connect?: boolean): Promise<AiAutomationStatus> {
  const endpoint =
    connect === true
      ? `${API_BASE}/system/ai_connect`
      : connect === false
      ? `${API_BASE}/system/ai_disconnect`
      : `${API_BASE}/system/toggle_ai`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  if (!res.ok) {
    throw new Error(`Failed to toggle AI status: ${res.statusText}`);
  }
  return res.json();
}

export interface PlanActionResponse {
  status: string;
  message: string;
  incident: IncidentDetail;
}

export interface SendMessageResponse {
  status: string;
  message: string;
  engineer_message: WarRoomMessage;
  incident: IncidentDetail;
}

export async function sendWarRoomMessage(
  incidentId: number,
  content: string,
  senderName: string = "Nöbetçi Mühendis (On-Call SRE)"
): Promise<SendMessageResponse> {
  const res = await fetch(`${API_BASE}/incidents/${incidentId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, sender_name: senderName })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Mesaj iletilemedi: ${res.statusText}`);
  }
  return data;
}

export async function approveIncidentPlan(
  incidentId: number,
  approvedBy: string = "Nöbetçi Mühendis (On-Call SRE)",
  planId?: string,
  messageId?: number
): Promise<PlanActionResponse> {
  const res = await fetch(`${API_BASE}/incidents/${incidentId}/approve_plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved_by: approvedBy, plan_id: planId, message_id: messageId })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Plan onaylanamadı: ${res.statusText}`);
  }
  return data;
}

export async function rejectIncidentPlan(
  incidentId: number,
  rejectedBy: string = "Nöbetçi Mühendis (On-Call SRE)",
  reason?: string
): Promise<PlanActionResponse> {
  const res = await fetch(`${API_BASE}/incidents/${incidentId}/reject_plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rejected_by: rejectedBy, reason: reason })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Plan reddedilemedi: ${res.statusText}`);
  }
  return data;
}

export interface RegeneratePostMortemResponse {
  status: string;
  message: string;
  post_mortem: PostMortem;
  incident: IncidentDetail;
}

export async function regeneratePostMortem(incidentId: number): Promise<RegeneratePostMortemResponse> {
  const res = await fetch(`${API_BASE}/incidents/${incidentId}/post_mortem/regenerate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Post-Mortem yeniden oluşturulamadı: ${res.statusText}`);
  }
  return data;
}

export function getPostMortemExportUrl(incidentId: number): string {
  return `${API_BASE}/incidents/${incidentId}/post_mortem/export`;
}

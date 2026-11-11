export type NodeHealth = "NORMAL" | "WARNING" | "CRITICAL";

export type SystemState = "NORMAL" | "DEGRADED" | "REMEDIATING" | "STABILIZED";

export type RemediationActionType =
  | "ACTION_THROTTLE_CPU"
  | "ACTION_REBALANCE_STREAM"
  | "ACTION_TRIP_CIRCUIT"
  | "ACTION_MANUAL_RESET";

export type AnomalyType = "THERMAL_SPIKE" | "VIBRATION_SPIKE" | "NONE";

export interface TelemetryMetric {
  timestamp: number;
  node_id: string;
  vibration_hz: number;
  temperature_c: number;
  power_load_kw: number;
  clock_drift_ms: number;
}

export interface RollingStats {
  count: number;
  mean: number;
  std_dev: number;
  min: number;
  max: number;
}

export interface StreamWindow {
  vibration_hz: number[];
  temperature_c: number[];
  power_load_kw: number[];
  clock_drift_ms: number[];
}

export interface EvaluationResult {
  node_id: string;
  timestamp: number;
  classification: NodeHealth;
  z_scores: Record<string, number>;
  confidence: number;
  anomaly_type: AnomalyType;
}

export interface RemediationAction {
  id: string;
  type: RemediationActionType;
  node_id: string;
  timestamp: number;
  metric_spike: string;
  confidence_score: number;
  status: "PENDING" | "EXECUTED" | "COMPLETED";
  execution_log: string;
}

export interface RingBufferEntry {
  id: string;
  timestamp: number;
  node_id: string;
  classification: NodeHealth;
  action: RemediationActionType | null;
  confidence: number;
}

export interface EnrichedMetric extends TelemetryMetric {
  stats: Record<string, RollingStats>;
  window: StreamWindow;
}

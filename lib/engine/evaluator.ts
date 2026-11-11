import type {
  AnomalyType,
  EvaluationResult,
  NodeHealth,
  RollingStats,
} from "@/lib/types";

const WARNING_THRESHOLD = 2.5;
const CRITICAL_THRESHOLD = 3.2;

function zScore(value: number, stats: RollingStats): number {
  if (stats.std_dev === 0 || stats.count < 2) {
    return 0;
  }
  return Math.abs(value - stats.mean) / stats.std_dev;
}

function classify(maxZ: number): NodeHealth {
  if (maxZ > CRITICAL_THRESHOLD) return "CRITICAL";
  if (maxZ > WARNING_THRESHOLD) return "WARNING";
  return "NORMAL";
}

function detectAnomalyType(
  zScores: Record<string, number>
): AnomalyType {
  let maxMetric = "";
  let maxZ = 0;

  for (const [metric, z] of Object.entries(zScores)) {
    if (z > maxZ) {
      maxZ = z;
      maxMetric = metric;
    }
  }

  if (maxZ <= WARNING_THRESHOLD) return "NONE";
  if (maxMetric === "temperature_c" || maxMetric === "power_load_kw") {
    return "THERMAL_SPIKE";
  }
  return "VIBRATION_SPIKE";
}

export function evaluateMetric(
  nodeId: string,
  timestamp: number,
  value: number,
  stats: RollingStats,
  allZScores: Record<string, number>
): EvaluationResult {
  const z = zScore(value, stats);
  const maxZ = Math.max(z, ...Object.values(allZScores));
  const classification = classify(maxZ);
  const anomalyType = detectAnomalyType(allZScores);

  const confidence = Math.min(maxZ / CRITICAL_THRESHOLD, 1);

  return {
    node_id: nodeId,
    timestamp,
    classification,
    z_scores: allZScores,
    confidence,
    anomaly_type: anomalyType,
  };
}

export { WARNING_THRESHOLD, CRITICAL_THRESHOLD, zScore, classify };

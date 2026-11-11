import type { TelemetryMetric } from "@/lib/types";

const NODE_IDS = ["NODE-01", "NODE-02", "NODE-03", "NODE-04"];

const BASE_RANGES: Record<string, { min: number; max: number }> = {
  vibration_hz: { min: 10, max: 100 },
  temperature_c: { min: 30, max: 110 },
  power_load_kw: { min: 1, max: 25 },
  clock_drift_ms: { min: 0, max: 5 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomNodeId(): string {
  return NODE_IDS[Math.floor(Math.random() * NODE_IDS.length)];
}

interface GeneratorOptions {
  intervalMs?: number;
  anomalyEnabled?: boolean;
  anomalyNodeId?: string;
  anomalyType?: "THERMAL_SPIKE" | "VIBRATION_SPIKE";
}

export function createTelemetryGenerator(
  options: GeneratorOptions = {}
): ReadableStream<TelemetryMetric> {
  const {
    intervalMs = 100,
    anomalyEnabled = false,
    anomalyNodeId = randomNodeId(),
    anomalyType = "THERMAL_SPIKE",
  } = options;

  let controller: ReadableStreamDefaultController<TelemetryMetric>;
  let intervalId: ReturnType<typeof setInterval>;
  let anomalyActive = false;
  let anomalyStartTime = 0;

  function emitMetric(): void {
    const now = Date.now();
    const nodeId = anomalyEnabled && anomalyActive ? anomalyNodeId : randomNodeId();

    const isAnomalyNode = nodeId === anomalyNodeId && anomalyActive;

    let vibration_hz = randomInRange(
      BASE_RANGES.vibration_hz.min,
      BASE_RANGES.vibration_hz.max
    );
    let temperature_c = randomInRange(
      BASE_RANGES.temperature_c.min,
      BASE_RANGES.temperature_c.max
    );
    let power_load_kw = randomInRange(
      BASE_RANGES.power_load_kw.min,
      BASE_RANGES.power_load_kw.max
    );
    let clock_drift_ms = randomInRange(
      BASE_RANGES.clock_drift_ms.min,
      BASE_RANGES.clock_drift_ms.max
    );

    if (isAnomalyNode) {
      const elapsed = now - anomalyStartTime;
      const intensity = Math.min(elapsed / 3000, 1);

      if (anomalyType === "THERMAL_SPIKE") {
        temperature_c = clamp(
          randomInRange(90, 110) * intensity + temperature_c * (1 - intensity),
          30,
          110
        );
        power_load_kw = clamp(
          randomInRange(20, 25) * intensity + power_load_kw * (1 - intensity),
          1,
          25
        );
      } else if (anomalyType === "VIBRATION_SPIKE") {
        vibration_hz = clamp(
          randomInRange(80, 100) * intensity + vibration_hz * (1 - intensity),
          10,
          100
        );
        clock_drift_ms = clamp(
          randomInRange(3, 5) * intensity + clock_drift_ms * (1 - intensity),
          0,
          5
        );
      }
    }

    controller.enqueue({
      timestamp: now,
      node_id: nodeId,
      vibration_hz: Number(vibration_hz.toFixed(2)),
      temperature_c: Number(temperature_c.toFixed(2)),
      power_load_kw: Number(power_load_kw.toFixed(2)),
      clock_drift_ms: Number(clock_drift_ms.toFixed(2)),
    });
  }

  function startAnomaly(): void {
    anomalyActive = true;
    anomalyStartTime = Date.now();
  }

  function stopAnomaly(): void {
    anomalyActive = false;
  }

  const stream = new ReadableStream<TelemetryMetric>({
    start(c) {
      controller = c;
      intervalId = setInterval(emitMetric, intervalMs);
    },
    cancel() {
      if (intervalId) clearInterval(intervalId);
    },
  });

  return Object.assign(stream, { startAnomaly, stopAnomaly });
}

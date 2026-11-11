import type {
  RollingStats,
  StreamWindow,
  TelemetryMetric,
} from "@/lib/types";

const WINDOW_SIZE = 50;

function computeStats(values: number[]): RollingStats {
  const count = values.length;
  if (count === 0) {
    return { count: 0, mean: 0, std_dev: 0, min: 0, max: 0 };
  }

  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / count;

  if (count === 1) {
    return { count, mean, std_dev: 0, min: values[0], max: values[0] };
  }

  const variance =
    values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (count - 1);
  const std_dev = Math.sqrt(variance);

  return {
    count,
    mean,
    std_dev,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function pushWindow(
  window: StreamWindow,
  metric: TelemetryMetric
): StreamWindow {
  return {
    vibration_hz: [...window.vibration_hz, metric.vibration_hz].slice(-WINDOW_SIZE),
    temperature_c: [...window.temperature_c, metric.temperature_c].slice(-WINDOW_SIZE),
    power_load_kw: [...window.power_load_kw, metric.power_load_kw].slice(-WINDOW_SIZE),
    clock_drift_ms: [...window.clock_drift_ms, metric.clock_drift_ms].slice(-WINDOW_SIZE),
  };
}

interface EnrichedMetric extends TelemetryMetric {
  stats: Record<string, RollingStats>;
  window: StreamWindow;
}

export function createStreamPipeline(): TransformStream<
  TelemetryMetric,
  EnrichedMetric
> {
  const windows: Record<string, StreamWindow> = {};

  function getWindow(nodeId: string): StreamWindow {
    if (!windows[nodeId]) {
      windows[nodeId] = {
        vibration_hz: [],
        temperature_c: [],
        power_load_kw: [],
        clock_drift_ms: [],
      };
    }
    return windows[nodeId];
  }

  return new TransformStream<TelemetryMetric, EnrichedMetric>({
    transform(metric, controller) {
      const window = getWindow(metric.node_id);
      const updated = pushWindow(window, metric);

      const stats: Record<string, RollingStats> = {
        vibration_hz: computeStats(updated.vibration_hz),
        temperature_c: computeStats(updated.temperature_c),
        power_load_kw: computeStats(updated.power_load_kw),
        clock_drift_ms: computeStats(updated.clock_drift_ms),
      };

      controller.enqueue({ ...metric, stats, window: updated });
    },
    flush() {
      // No-op: windows retained in closure for continued use
    },
  });
}

export { WINDOW_SIZE, computeStats, pushWindow };

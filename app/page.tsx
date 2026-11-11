"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Cpu,
  Square,
  TrendingUp,
  Zap,
} from "lucide-react";

import type {
  EnrichedMetric,
  EvaluationResult,
  RemediationAction,
  TelemetryMetric,
} from "@/lib/types";
import {
  createStreamPipeline,
  WINDOW_SIZE,
} from "@/lib/stream/pipeline";
import { createTelemetryGenerator } from "@/lib/stream/generator";
import { evaluateMetric } from "@/lib/engine/evaluator";
import { RemediationStateMachine } from "@/lib/engine/state-machine";

const CYAN = "#00F0FF";
const EMERALD = "#10B981";
const AMBER = "#F59E0B";
const BG = "#090D16";
const GRID = "#1E293B";

const METRIC_KEYS: Array<keyof TelemetryMetric> = [
  "vibration_hz",
  "temperature_c",
  "power_load_kw",
  "clock_drift_ms",
];

type State = "NORMAL" | "DEGRADED" | "REMEDIATING" | "STABILIZED";

export default function SentinelEdgePage() {
  const [isRunning, setIsRunning] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<keyof TelemetryMetric>(
    "temperature_c"
  );
  const [anomalyType, setAnomalyType] = useState<
    "THERMAL_SPIKE" | "VIBRATION_SPIKE" | "NONE"
  >("NONE");
  const [currentReading, setCurrentReading] = useState<TelemetryMetric | null>(
    null
  );
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [systemState, setSystemState] = useState<State>("NORMAL");
  const [auditLog, setAuditLog] = useState<RemediationAction[]>([]);
  const [activeAnomalies, setActiveAnomalies] = useState(0);
  const [avgLatency, setAvgLatency] = useState(0);

  const streamRef = useRef<ReadableStream<TelemetryMetric> | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<TelemetryMetric> | null>(
    null
  );
  const historyRef = useRef<EnrichedMetric[]>([]);
  const latencyRef = useRef<number[]>([]);
  const stateMachineRef = useRef<RemediationStateMachine | null>(null);

  const streamStart = useCallback(() => {
    const generator = createTelemetryGenerator({
      intervalMs: 80,
      anomalyEnabled: anomalyType !== "NONE",
      anomalyNodeId: "NODE-01",
      anomalyType: anomalyType as "THERMAL_SPIKE" | "VIBRATION_SPIKE",
    });

    const pipeline = createStreamPipeline();
    const pipeStream = generator.pipeThrough(pipeline);

    const reader = pipeStream.getReader();
    readerRef.current = reader;
    streamRef.current = generator as ReadableStream<TelemetryMetric>;
    stateMachineRef.current = new RemediationStateMachine();

    stateMachineRef.current.subscribe((entry) => {
      if (entry.action) {
        const action: RemediationAction = {
          id: entry.id,
          type: entry.action,
          node_id: entry.node_id,
          timestamp: entry.timestamp,
          metric_spike: selectedMetric,
          confidence_score: entry.confidence,
          status: "EXECUTED",
          execution_log: `Autonomous remediation: ${entry.action} on ${entry.node_id}`,
        };
        setAuditLog((prev) => [action, ...prev].slice(0, 50));
        setActiveAnomalies((p) => p + 1);
      }
    });

    function process(): void {
      reader
        .read()
        .then(({ value, done }) => {
          if (done || !isRunning) return;
          if (!value) {
            process();
            return;
          }

          const start = performance.now();

          const metric = value;
          const zScores: Record<string, number> = {};
          for (const key of METRIC_KEYS) {
            zScores[key] =
              Math.abs(Number(metric[key]) - metric.stats[key].mean) /
              (metric.stats[key].std_dev || 1);
          }

          const result = evaluateMetric(
            metric.node_id,
            metric.timestamp,
            Number(metric[selectedMetric]),
            metric.stats[selectedMetric],
            zScores
          );

          const end = performance.now();
          latencyRef.current.push(end - start);
          if (latencyRef.current.length > 100) {
            latencyRef.current.shift();
          }
          const avg =
            latencyRef.current.reduce((a, b) => a + b, 0) /
            latencyRef.current.length;
          setAvgLatency(avg);

          setCurrentReading(metric);
          setEvaluation(result);
          setSystemState((prev) => {
            const sm = stateMachineRef.current;
            if (!sm) return prev;
            const action = sm.evaluateAndTransition(
              metric.node_id,
              result.classification,
              result.confidence,
              selectedMetric,
              metric.timestamp
            );
            if (action) {
              setAuditLog((prevLog) => [action, ...prevLog].slice(0, 50));
              setActiveAnomalies((p) => p + 1);
            }
            return sm.getCurrentState();
          });

          historyRef.current.push(metric);
          if (historyRef.current.length > 300) {
            historyRef.current.shift();
          }

          process();
        })
        .catch(() => {
          // Stream ended or errored
        });
    }

    process();

    return () => {
      readerRef.current?.releaseLock();
    };
  }, [isRunning, anomalyType, selectedMetric]);

  useEffect(() => {
    if (!isRunning) return;
    const cleanup = streamStart();
    return cleanup;
  }, [isRunning, streamStart]);

  const startStream = useCallback(() => {
    setIsRunning(true);
    setAnomalyType("NONE");
  }, []);

  const stopStream = useCallback(() => {
    setIsRunning(false);
    readerRef.current?.cancel();
  }, []);

  const injectThermal = useCallback(() => {
    setIsRunning(true);
    setAnomalyType("THERMAL_SPIKE");
  }, []);

  const injectVibration = useCallback(() => {
    setIsRunning(true);
    setAnomalyType("VIBRATION_SPIKE");
  }, []);

  const manualReset = useCallback(() => {
    const sm = stateMachineRef.current;
    const action = sm?.manualReset();
    if (action) {
      setAuditLog((prev) => [action, ...prev].slice(0, 50));
    }
    setSystemState("NORMAL");
    setActiveAnomalies(0);
  }, []);

  const history = useMemo(() => historyRef.current, []);
  const recent = useMemo(() => history.slice(-120), [history]);

  const statusColor = useMemo(() => {
    switch (systemState) {
      case "NORMAL":
        return EMERALD;
      case "DEGRADED":
        return AMBER;
      case "REMEDIATING":
        return CYAN;
      case "STABILIZED":
        return EMERALD;
    }
  }, [systemState]);

  const latestZ = useMemo(() => {
    if (!evaluation) return 0;
    return Math.max(...Object.values(evaluation.z_scores));
  }, [evaluation]);

  const metricMinMax = useMemo(() => {
    if (recent.length === 0) return { min: 0, max: 0 };
    const values = recent.map((m) => Number(m[selectedMetric]));
    return {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }, [recent, selectedMetric]);

  return (
    <div className="h-full flex flex-col bg-[#090D16] text-[#00F0FF] overflow-hidden selection:bg-[#00F0FF]/20">
      <header className="h-16 border-b border-[#1E293B] flex items-center justify-between px-6 shrink-0 bg-[#090D16]/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-[#00F0FF]/20 flex items-center justify-center text-[#00F0FF] border border-[#00F0FF]/30">
            <Zap size={18} />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">SentinelEdge</h1>
            <p className="text-xs text-[#00F0FF]/60">
              Autonomous Anomaly Detection & Self-Healing Stream Engine
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#1E293B] bg-[#090D16]/50 text-xs">
            <span className="w-2 h-2 rounded-full bg-[#00F0FF] animate-pulse" />
            <span>Edge Node Active</span>
          </div>
          <button
            onClick={startStream}
            disabled={isRunning}
            className="px-4 py-1.5 rounded text-xs font-semibold border border-[#00F0FF]/50 text-[#00F0FF] hover:bg-[#00F0FF]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRunning ? "RUNNING" : "START ENGINE"}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-12 grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
          <MetricCard
            title="Node Health"
            value={systemState}
            status={systemState}
            Icon={Cpu}
            color={statusColor}
          />
          <MetricCard
            title="Active Anomalies"
            value={activeAnomalies.toString()}
            status={activeAnomalies > 0 ? "CRITICAL" : "NORMAL"}
            Icon={AlertCircle}
            color={activeAnomalies > 0 ? AMBER : EMERALD}
          />
          <MetricCard
            title="Avg Eval Latency"
            value={avgLatency.toFixed(2) + " ms"}
            status="NORMAL"
            Icon={TrendingUp}
            color={CYAN}
          />
          <MetricCard
            title="Stream Window"
            value={WINDOW_SIZE + " samples"}
            status="NORMAL"
            Icon={BarChart3}
            color={CYAN}
          />
        </div>

        <div className="lg:col-span-7 flex flex-col gap-4">
          <LiveStreamPanel
            history={recent}
            selectedMetric={selectedMetric}
            metricMinMax={metricMinMax}
            evaluation={evaluation}
            currentReading={currentReading}
          />
          <div className="grid grid-cols-2 gap-4">
            <MetricSelector
              value={selectedMetric}
              onChange={setSelectedMetric}
            />
            <AnomalyControls
              value={anomalyType}
              onChange={setAnomalyType}
              isRunning={isRunning}
              onInjectThermal={injectThermal}
              onInjectVibration={injectVibration}
              onManualReset={manualReset}
              onStart={startStream}
              onStop={stopStream}
            />
          </div>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-4">
          <AuditLog actions={auditLog} />
        </div>
      </main>
    </div>
  );
}

function MetricCard({
  title,
  value,
  status,
  Icon,
  color,
}: {
  title: string;
  value: string | number;
  status: "NORMAL" | "WARNING" | "CRITICAL" | string;
  Icon: React.ComponentType<{ size?: number }>;
  color: string;
}) {
  const glow =
    status === "CRITICAL"
      ? "shadow-[0_0_20px_rgba(245,158,11,0.35)]"
      : status === "WARNING"
        ? "shadow-[0_0_20px_rgba(245,158,11,0.25)]"
        : "shadow-[0_0_15px_rgba(0,240,255,0.15)]";

  return (
    <div className="rounded-xl border border-[#1E293B] bg-[#090D16]/60 p-4 flex flex-col gap-2 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={16} />
          <h3 className="text-xs text-[#00F0FF]/50 font-medium uppercase tracking-wider">
            {title}
          </h3>
        </div>
        <div
          className={`w-2.5 h-2.5 rounded-full ${glow}`}
          style={{ backgroundColor: color }}
        />
      </div>
      <div className="mt-1">
        <p className="text-2xl font-bold font-mono">{value}</p>
      </div>
    </div>
  );
}

function LiveStreamPanel({
  history,
  selectedMetric,
  metricMinMax,
  evaluation,
  currentReading,
}: {
  history: EnrichedMetric[];
  selectedMetric: keyof TelemetryMetric;
  metricMinMax: { min: number; max: number };
  evaluation: EvaluationResult | null;
  currentReading: TelemetryMetric | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = 32;
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;

    if (history.length === 0) {
      ctx.clearRect(0, 0, width, height);
      return;
    }

    const { min, max } = metricMinMax;
    const range = max - min || 1;
    const values = history.map((m) => Number(m[selectedMetric]));

    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const y = padding + (plotHeight / 4) * i;
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + plotWidth, y);
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = CYAN;
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = 10;

    const stepX = plotWidth / Math.max(history.length - 1, 1);

    history.forEach((point, i) => {
      const x = padding + i * stepX;
      const y =
        padding +
        plotHeight -
        ((Number(point[selectedMetric]) - min) / range) * plotHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (evaluation && evaluation.classification !== "NORMAL") {
      const lastIdx = history.length - 1;
      const x = padding + lastIdx * stepX;
      const y =
        padding +
        plotHeight -
        ((Number(history[lastIdx][selectedMetric]) - min) / range) * plotHeight;
      ctx.fillStyle = AMBER;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const lastVal = history[history.length - 1][selectedMetric];
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px Inter, sans-serif";
    ctx.fillText(
      `${selectedMetric}: ${Number(lastVal).toFixed(2)}`,
      padding,
      padding - 8
    );
  }, [history, selectedMetric, metricMinMax, evaluation]);

  const unitMap: Record<string, string> = {
    temperature_c: "°C",
    vibration_hz: "Hz",
    power_load_kw: "kW",
    clock_drift_ms: "ms",
  };

  return (
    <div className="flex-1 rounded-xl border border-[#1E293B] bg-[#090D16]/60 p-5 backdrop-blur-sm relative">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold">Live Telemetry Stream</h3>
        <span className="text-xs text-[#00F0FF]/60 font-mono">
          NDJSON @ 100ms interval
        </span>
      </div>
      <div className="flex-1 relative">
        <canvas ref={canvasRef} className="w-full h-48 block" />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-[#00F0FF]/50">
        <span>
          {currentReading?.node_id} · {new Date(
            currentReading?.timestamp || 0
          ).toLocaleTimeString()}
        </span>
        <span className="font-mono">
          {currentReading?.[selectedMetric] != null
            ? Number(currentReading[selectedMetric]).toFixed(2)
            : 0}{" "}
          {unitMap[selectedMetric]}
        </span>
      </div>
    </div>
  );
}

function MetricSelector({
  value,
  onChange,
}: {
  value: keyof TelemetryMetric;
  onChange: (v: keyof TelemetryMetric) => void;
}) {
  const metrics: Array<{ key: keyof TelemetryMetric; label: string; unit: string }> = [
    { key: "temperature_c", label: "Temperature", unit: "°C" },
    { key: "vibration_hz", label: "Vibration", unit: "Hz" },
    { key: "power_load_kw", label: "Power Load", unit: "kW" },
    { key: "clock_drift_ms", label: "Clock Drift", unit: "ms" },
  ];

  return (
    <div className="rounded-xl border border-[#1E293B] bg-[#090D16]/60 p-4 backdrop-blur-sm">
      <h3 className="text-xs font-bold text-[#00F0FF]/50 uppercase tracking-wider mb-3">
        Metric View
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {metrics.map((m) => (
          <button
            key={m.key}
            onClick={() => onChange(m.key)}
            className={`rounded border py-2 text-xs font-medium transition-colors ${
              value === m.key
                ? "border-[#00F0FF] bg-[#00F0FF]/10 text-[#00F0FF]"
                : "border-[#1E293B] text-[#00F0FF]/40 hover:border-[#00F0FF]/50"
            }`}
          >
            {m.label} <span className="text-[#00F0FF]/30">{m.unit}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AnomalyControls({
  value,
  onChange,
  isRunning,
  onInjectThermal,
  onInjectVibration,
  onManualReset,
  onStart,
  onStop,
}: {
  value: "THERMAL_SPIKE" | "VIBRATION_SPIKE" | "NONE";
  onChange: (v: "THERMAL_SPIKE" | "VIBRATION_SPIKE" | "NONE") => void;
  isRunning: boolean;
  onInjectThermal: () => void;
  onInjectVibration: () => void;
  onManualReset: () => void;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <div className="rounded-xl border border-[#1E293B] bg-[#090D16]/60 p-4 backdrop-blur-sm">
      <h3 className="text-xs font-bold text-[#00F0FF]/50 uppercase tracking-wider mb-3">
        Control Box
      </h3>
      <div className="flex flex-col gap-2">
        <button
          onClick={onInjectThermal}
          disabled={isRunning && value !== "NONE"}
          className="w-full py-2.5 rounded border border-[#F59E0B]/50 bg-[#F59E0B]/10 text-[#F59E0B] text-xs font-semibold hover:bg-[#F59E0B]/20 transition-colors disabled:opacity-50"
        >
          <ArrowRight size={14} />
          Inject Thermal Spike
        </button>
        <button
          onClick={onInjectVibration}
          disabled={isRunning && value !== "NONE"}
          className="w-full py-2.5 rounded border border-[#00F0FF]/50 bg-[#00F0FF]/10 text-[#00F0FF] text-xs font-semibold hover:bg-[#00F0FF]/20 transition-colors disabled:opacity-50"
        >
          <TrendingUp size={14} />
          Inject Vibration Noise
        </button>
        <button
          onClick={onManualReset}
          className="w-full py-2.5 rounded border border-[#1E293B] bg-[#090D16]/40 text-[#00F0FF]/60 text-xs font-semibold hover:border-[#00F0FF]/50 transition-colors"
        >
          <Square size={14} />
          Manual Override / Reset
        </button>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-[#00F0FF]/40">System State</span>
        <span
          className={`text-xs font-mono font-bold px-2 py-1 rounded border ${
            value === "NONE"
              ? "border-[#10B981]/50 text-[#10B981] bg-[#10B981]/10"
              : "border-[#F59E0B]/50 text-[#F59E0B] bg-[#F59E0B]/10"
          }`}
        >
          {value === "NONE" ? "MONITORING" : "ANOMALY ACTIVE"}
        </span>
      </div>
    </div>
  );
}

function AuditLog({
  actions,
}: {
  actions: RemediationAction[];
}) {
  return (
    <div className="flex-1 rounded-xl border border-[#1E293B] bg-[#090D16]/60 p-4 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold">Autonomous Action Audit Log</h3>
        <span className="text-xs text-[#00F0FF]/60 font-mono">
          Ring buffer: 1,000 events
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#1E293B]">
              <th className="pb-2 text-[#00F0FF]/40 font-medium w-20">Time</th>
              <th className="pb-2 text-[#00F0FF]/40 font-medium w-24">Node</th>
              <th className="pb-2 text-[#00F0FF]/40 font-medium">Action</th>
              <th className="pb-2 text-[#00F0FF]/40 font-medium w-20">Metric</th>
              <th className="pb-2 text-[#00F0FF]/40 font-medium w-16">Conf.</th>
              <th className="pb-2 text-[#00F0FF]/40 font-medium w-24">Status</th>
            </tr>
          </thead>
          <tbody>
            {actions.slice(0, 30).map((action) => (
              <tr key={action.id} className="border-b border-[#1E293B]/50 hover:bg-[#00F0FF]/5 transition-colors">
                <td className="py-2 font-mono text-[#00F0FF]/50">
                  {new Date(action.timestamp).toLocaleTimeString("en-US", {
                    hour12: false,
                  })}
                </td>
                <td className="py-2 font-mono text-[#00F0FF]/60">
                  {action.node_id}
                </td>
                <td className="py-2 text-[#00F0FF]/70">
                  {action.type.replace("ACTION_", "").replace(/_/g, " ")}
                </td>
                <td className="py-2 text-[#00F0FF]/50 font-mono">
                  {action.metric_spike}
                </td>
                <td className="py-2 font-mono">
                  {(action.confidence_score * 100).toFixed(0)}%
                </td>
                <td className="py-2">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                      action.status === "COMPLETED"
                        ? "border-[#10B981]/50 text-[#10B981] bg-[#10B981]/10"
                        : "border-[#00F0FF]/50 text-[#00F0FF] bg-[#00F0FF]/10"
                    }`}
                  >
                    {action.status}
                  </span>
                </td>
              </tr>
            ))}
            {actions.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-[#00F0FF]/40">
                  No autonomous actions executed yet. Inject an anomaly to trigger self-healing.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 pt-3 border-t border-[#1E293B]/50 flex items-center justify-between text-xs">
        <span className="text-[#00F0FF]/50">Execution mode: LOCAL / OFFLINE</span>
        <span className="text-[#10B981]/60 font-bold">Zero cloud dependencies</span>
      </div>
    </div>
  );
}

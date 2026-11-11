import assert from "node:assert";
import { test } from "node:test";

import {
  createStreamPipeline,
  WINDOW_SIZE,
  computeStats,
  pushWindow,
} from "../dist/stream/pipeline.js";
import {
  evaluateMetric,
  WARNING_THRESHOLD,
  CRITICAL_THRESHOLD,
  zScore,
  classify,
} from "../dist/engine/evaluator.js";
import { RemediationStateMachine } from "../dist/engine/state-machine.js";

// ========== computeStats ==========
test("computeStats: single value", () => {
  const s = computeStats([10]);
  assert.strictEqual(s.count, 1);
  assert.strictEqual(s.mean, 10);
  assert.strictEqual(s.std_dev, 0);
  assert.strictEqual(s.min, 10);
  assert.strictEqual(s.max, 10);
  
});

test("computeStats: multiple values", () => {
  const s = computeStats([2, 4, 4, 4, 5, 5, 7, 9]);
  assert.strictEqual(s.count, 8);
  assert.strictEqual(s.mean, 5);
  const sd = Math.round(s.std_dev * 100) / 100;
  assert.ok(sd === 2 || sd === 2.14, `std_dev ~2, got ${s.std_dev}`);
  assert.strictEqual(s.min, 2);
  assert.strictEqual(s.max, 9);
  
});

test("computeStats: empty array", () => {
  const s = computeStats([]);
  assert.strictEqual(s.count, 0);
  assert.strictEqual(s.mean, 0);
  assert.strictEqual(s.std_dev, 0);
  
});

// ========== WINDOW_SIZE ==========
test("WINDOW_SIZE is 50", () => {
  assert.strictEqual(WINDOW_SIZE, 50);
  
});

// ========== zScore ==========
test("zScore: zero std_dev returns 0", () => {
  assert.strictEqual(
    zScore(10, { count: 5, mean: 10, std_dev: 0, min: 10, max: 10 }),
    0
  );
  assert.strictEqual(
    zScore(100, { count: 5, mean: 10, std_dev: 0, min: 10, max: 10 }),
    0
  );
  
});

test("zScore: count < 2 returns 0", () => {
  assert.strictEqual(
    zScore(10, { count: 1, mean: 10, std_dev: 0, min: 10, max: 10 }),
    0
  );
  
});

test("zScore: correct calculation", () => {
  assert.strictEqual(
    zScore(10, { count: 5, mean: 10, std_dev: 2, min: 8, max: 12 }),
    0
  );
  assert.strictEqual(
    zScore(14, { count: 5, mean: 10, std_dev: 2, min: 8, max: 12 }),
    2
  );
  assert.strictEqual(
    zScore(6, { count: 5, mean: 10, std_dev: 2, min: 8, max: 12 }),
    2
  );
  
});

// ========== classify ==========
test("classify: NORMAL for z <= 2.5", () => {
  assert.strictEqual(classify(0), "NORMAL");
  assert.strictEqual(classify(2.5), "NORMAL");
  assert.strictEqual(classify(2.49), "NORMAL");
  
});

test("classify: WARNING for 2.5 < z <= 3.2", () => {
  assert.strictEqual(classify(2.51), "WARNING");
  assert.strictEqual(classify(3.0), "WARNING");
  assert.strictEqual(classify(3.2), "WARNING");
  
});

test("classify: CRITICAL for z > 3.2", () => {
  assert.strictEqual(classify(3.21), "CRITICAL");
  assert.strictEqual(classify(5.0), "CRITICAL");
  
});

// ========== Thresholds ==========
test("thresholds: WARNING 2.5, CRITICAL 3.2", () => {
  assert.strictEqual(WARNING_THRESHOLD, 2.5);
  assert.strictEqual(CRITICAL_THRESHOLD, 3.2);
  
});

// ========== evaluateMetric ==========
test("evaluateMetric: NORMAL classification", () => {
  const stats = { count: 10, mean: 50, std_dev: 5, min: 40, max: 60 };
  const r = evaluateMetric("NODE-01", Date.now(), 55, stats, {
    vibration_hz: 1,
    temperature_c: 1,
    power_load_kw: 1,
    clock_drift_ms: 1,
  });
  assert.strictEqual(r.classification, "NORMAL");
  assert.strictEqual(r.anomaly_type, "NONE");
  assert.ok(r.confidence >= 0 && r.confidence <= 1);
  
});

test("evaluateMetric: WARNING classification", () => {
  const stats = { count: 10, mean: 50, std_dev: 5, min: 40, max: 60 };
  const r = evaluateMetric("NODE-01", Date.now(), 63, stats, {
    vibration_hz: 1,
    temperature_c: 3,
    power_load_kw: 1,
    clock_drift_ms: 1,
  });
  assert.strictEqual(r.classification, "WARNING");
  
});

test("evaluateMetric: CRITICAL classification", () => {
  const stats = { count: 10, mean: 50, std_dev: 5, min: 40, max: 60 };
  const r = evaluateMetric("NODE-01", Date.now(), 70, stats, {
    vibration_hz: 1,
    temperature_c: 8,
    power_load_kw: 1,
    clock_drift_ms: 1,
  });
  assert.strictEqual(r.classification, "CRITICAL");
  
});

test("evaluateMetric: thermal spike detection", () => {
  const stats = { count: 10, mean: 50, std_dev: 5, min: 40, max: 60 };
  const r = evaluateMetric("NODE-01", Date.now(), 70, stats, {
    vibration_hz: 1,
    temperature_c: 8,
    power_load_kw: 1,
    clock_drift_ms: 1,
  });
  assert.strictEqual(r.anomaly_type, "THERMAL_SPIKE");
  
});

test("evaluateMetric: vibration spike detection", () => {
  const stats = { count: 10, mean: 50, std_dev: 5, min: 40, max: 60 };
  const r = evaluateMetric("NODE-01", Date.now(), 50, stats, {
    vibration_hz: 8,
    temperature_c: 1,
    power_load_kw: 1,
    clock_drift_ms: 1,
  });
  assert.strictEqual(r.anomaly_type, "VIBRATION_SPIKE");
  
});

test("evaluateMetric: confidence increases with severity", () => {
  const stats = { count: 10, mean: 50, std_dev: 5, min: 40, max: 60 };
  const normal = evaluateMetric("NODE-01", Date.now(), 50, stats, {
    vibration_hz: 1,
    temperature_c: 1,
    power_load_kw: 1,
    clock_drift_ms: 1,
  });
  const critical = evaluateMetric("NODE-01", Date.now(), 70, stats, {
    vibration_hz: 1,
    temperature_c: 8,
    power_load_kw: 1,
    clock_drift_ms: 1,
  });
  assert.ok(critical.confidence > normal.confidence);
  
});

test("evaluateMetric: includes all z-scores", () => {
  const stats = { count: 10, mean: 50, std_dev: 5, min: 40, max: 60 };
  const r = evaluateMetric("NODE-01", Date.now(), 50, stats, {
    vibration_hz: 2,
    temperature_c: 3,
    power_load_kw: 4,
    clock_drift_ms: 5,
  });
  assert.strictEqual(r.z_scores.vibration_hz, 2);
  assert.strictEqual(r.z_scores.temperature_c, 3);
  assert.strictEqual(r.z_scores.power_load_kw, 4);
  assert.strictEqual(r.z_scores.clock_drift_ms, 5);
  
});

// ========== State Machine ==========
test("StateMachine: initial state is NORMAL", () => {
  const sm = new RemediationStateMachine();
  assert.strictEqual(sm.getCurrentState(), "NORMAL");
  
});

test("StateMachine: CRITICAL transitions NORMAL -> DEGRADED -> REMEDIATING", () => {
  const sm = new RemediationStateMachine();
  const ts = Date.now();
  const action = sm.evaluateAndTransition("NODE-01", "CRITICAL", 0.95, "temperature_c", ts);
  assert.strictEqual(sm.getCurrentState(), "REMEDIATING");
  assert.ok(action !== null);
  if (action) {
    assert.strictEqual(action.node_id, "NODE-01");
    assert.strictEqual(action.status, "EXECUTED");
    assert.ok(action.execution_log.length > 0);
  }
  
});

test("StateMachine: NORMAL when already NORMAL returns null", () => {
  const sm = new RemediationStateMachine();
  const ts = Date.now();
  const action = sm.evaluateAndTransition("NODE-01", "NORMAL", 0.1, "temperature_c", ts);
  assert.strictEqual(sm.getCurrentState(), "NORMAL");
  assert.strictEqual(action, null);
  
});

test("StateMachine: REMEDIATING -> STABILIZED -> NORMAL on recovery", () => {
  const sm = new RemediationStateMachine();
  const ts = Date.now();
  sm.evaluateAndTransition("NODE-01", "CRITICAL", 0.95, "temperature_c", ts);
  assert.strictEqual(sm.getCurrentState(), "REMEDIATING");
  const action2 = sm.evaluateAndTransition("NODE-01", "NORMAL", 0.1, "temperature_c", ts + 1000);
  assert.strictEqual(sm.getCurrentState(), "STABILIZED");
  assert.strictEqual(action2, null);
  const action3 = sm.evaluateAndTransition("NODE-01", "NORMAL", 0.1, "temperature_c", ts + 2000);
  assert.strictEqual(sm.getCurrentState(), "NORMAL");
  assert.strictEqual(action3, null);
  
});

test("StateMachine: remediation action on CRITICAL", () => {
  const sm = new RemediationStateMachine();
  const ts = Date.now();
  const action = sm.evaluateAndTransition("NODE-02", "CRITICAL", 0.98, "vibration_hz", ts);
  assert.ok(action !== null);
  if (action) {
    assert.strictEqual(action.node_id, "NODE-02");
    assert.strictEqual(action.confidence_score, 0.98);
    assert.strictEqual(action.metric_spike, "vibration_hz");
    assert.ok(
      ["ACTION_THROTTLE_CPU", "ACTION_REBALANCE_STREAM", "ACTION_TRIP_CIRCUIT"].includes(
        action.type
      )
    );
  }
  
});

test("StateMachine: null for non-CRITICAL", () => {
  const sm = new RemediationStateMachine();
  const ts = Date.now();
  assert.strictEqual(
    sm.evaluateAndTransition("NODE-01", "WARNING", 0.5, "temperature_c", ts),
    null
  );
  assert.strictEqual(
    sm.evaluateAndTransition("NODE-01", "NORMAL", 0.1, "temperature_c", ts),
    null
  );
  
});

test("StateMachine: ring buffer stores CRITICAL entries", () => {
  const sm = new RemediationStateMachine();
  const ts = Date.now();
  sm.evaluateAndTransition("NODE-01", "CRITICAL", 0.95, "temperature_c", ts);
  sm.manualReset();
  sm.evaluateAndTransition("NODE-02", "CRITICAL", 0.90, "vibration_hz", ts + 100);
  const buffer = sm.getRingBuffer();
  const criticalEntries = buffer.filter((e) => e.classification === "CRITICAL");
  assert.strictEqual(criticalEntries.length, 2);
  assert.strictEqual(criticalEntries[0].node_id, "NODE-01");
  assert.strictEqual(criticalEntries[1].node_id, "NODE-02");
  assert.ok(criticalEntries.every((e) => e.action !== null));

});

test("StateMachine: ring buffer caps at 1000", () => {
  const sm = new RemediationStateMachine();
  const baseTs = Date.now();
  for (let i = 0; i < 1200; i++) {
    sm.evaluateAndTransition("NODE-01", "CRITICAL", 0.9, "temperature_c", baseTs + i);
    sm.manualReset();
  }
  const buffer = sm.getRingBuffer();
  assert.strictEqual(buffer.length, 1000);

});

test("StateMachine: manual reset returns to NORMAL from any state", () => {
  const sm = new RemediationStateMachine();
  const ts = Date.now();
  sm.evaluateAndTransition("NODE-01", "CRITICAL", 0.95, "temperature_c", ts);
  assert.strictEqual(sm.getCurrentState(), "REMEDIATING");
  const action = sm.manualReset();
  assert.strictEqual(sm.getCurrentState(), "NORMAL");
  assert.ok(action !== null);
  if (action) {
    assert.strictEqual(action.type, "ACTION_MANUAL_RESET");
    assert.strictEqual(action.status, "COMPLETED");
    assert.strictEqual(action.node_id, "SYSTEM");
  }
  
});

// ========== Pipeline ==========
test("Pipeline: createStreamPipeline returns TransformStream", () => {
  const pipeline = createStreamPipeline();
  assert.ok(pipeline);
  assert.ok(pipeline.readable);
  assert.ok(pipeline.writable);
  assert.strictEqual(typeof pipeline.readable.getReader, "function");
  assert.strictEqual(typeof pipeline.writable.getWriter, "function");
});

test("Pipeline: pushWindow maintains sliding window of 50", () => {
  const window = { vibration_hz: [], temperature_c: [], power_load_kw: [], clock_drift_ms: [] };
  let result = window;
  for (let i = 0; i < 60; i++) {
    result = pushWindow(result, {
      timestamp: Date.now(),
      node_id: "NODE-01",
      vibration_hz: 50,
      temperature_c: 60 + i,
      power_load_kw: 10,
      clock_drift_ms: 1,
    });
  }
  assert.strictEqual(result.temperature_c.length, WINDOW_SIZE);
});

test("Pipeline: pushWindow tracks separate windows per node_id", () => {
  const w1 = { vibration_hz: [], temperature_c: [], power_load_kw: [], clock_drift_ms: [] };
  const w2 = { vibration_hz: [], temperature_c: [], power_load_kw: [], clock_drift_ms: [] };

  const r1 = pushWindow(w1, {
    timestamp: Date.now(), node_id: "NODE-01", vibration_hz: 50,
    temperature_c: 60, power_load_kw: 10, clock_drift_ms: 1,
  });
  const r2 = pushWindow(w2, {
    timestamp: Date.now(), node_id: "NODE-02", vibration_hz: 50,
    temperature_c: 90, power_load_kw: 10, clock_drift_ms: 1,
  });

  assert.strictEqual(r1.temperature_c[0], 60);
  assert.strictEqual(r2.temperature_c[0], 90);
});


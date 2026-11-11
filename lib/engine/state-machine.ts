import type {
  RemediationAction,
  RemediationActionType,
  RingBufferEntry,
  SystemState,
} from "@/lib/types";

const RING_BUFFER_CAPACITY = 1000;

const ACTION_TYPES: RemediationActionType[] = [
  "ACTION_THROTTLE_CPU",
  "ACTION_REBALANCE_STREAM",
  "ACTION_TRIP_CIRCUIT",
];

const ACTION_LABELS: Record<RemediationActionType, string> = {
  ACTION_THROTTLE_CPU: "Throttle CPU allocation",
  ACTION_REBALANCE_STREAM: "Rebalance telemetry stream",
  ACTION_TRIP_CIRCUIT: "Trip circuit breaker",
  ACTION_MANUAL_RESET: "Manual system override",
};

const STATE_TRANSITIONS: Record<SystemState, SystemState[]> = {
  NORMAL: ["DEGRADED"],
  DEGRADED: ["REMEDIATING", "NORMAL"],
  REMEDIATING: ["STABILIZED", "DEGRADED"],
  STABILIZED: ["NORMAL"],
};

function isValidTransition(from: SystemState, to: SystemState): boolean {
  return STATE_TRANSITIONS[from].includes(to);
}

function selectRemediationAction(classification: string): RemediationActionType {
  if (classification === "CRITICAL") {
    return ACTION_TYPES[Math.floor(Math.random() * ACTION_TYPES.length)];
  }
  return ACTION_TYPES[0];
}

export class RemediationStateMachine {
  private state: SystemState = "NORMAL";
  private ringBuffer: RingBufferEntry[] = [];
  private bufferHead = 0;
  private bufferCount = 0;
  private listeners: Array<(entry: RingBufferEntry) => void> = [];

  getCurrentState(): SystemState {
    return this.state;
  }

  getRingBuffer(): RingBufferEntry[] {
    if (this.bufferCount < RING_BUFFER_CAPACITY) {
      return this.ringBuffer.slice(0, this.bufferCount);
    }
    return [
      ...this.ringBuffer.slice(this.bufferHead),
      ...this.ringBuffer.slice(0, this.bufferHead),
    ];
  }

  subscribe(listener: (entry: RingBufferEntry) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  private transition(to: SystemState): void {
    if (!isValidTransition(this.state, to)) {
      return;
    }
    this.state = to;
  }

  private pushRingBuffer(entry: RingBufferEntry): void {
    if (this.bufferCount < RING_BUFFER_CAPACITY) {
      this.ringBuffer[this.bufferCount] = entry;
      this.bufferCount++;
    } else {
      this.ringBuffer[this.bufferHead] = entry;
      this.bufferHead = (this.bufferHead + 1) % RING_BUFFER_CAPACITY;
    }

    for (const listener of this.listeners) {
      listener(entry);
    }
  }

  evaluateAndTransition(
    nodeId: string,
    classification: string,
    confidence: number,
    metricSpike: string,
    timestamp: number
  ): RemediationAction | null {
    const previousState = this.state;

    if (classification === "CRITICAL" && this.state !== "REMEDIATING") {
      this.transition("DEGRADED");
      this.transition("REMEDIATING");

      const actionType = selectRemediationAction(classification);
      const action: RemediationAction = {
        id: `action-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
        type: actionType,
        node_id: nodeId,
        timestamp,
        metric_spike: metricSpike,
        confidence_score: confidence,
        status: "EXECUTED",
        execution_log: `${ACTION_LABELS[actionType]} executed on ${nodeId} at ${new Date(timestamp).toISOString()}`,
      };

      this.pushRingBuffer({
        id: action.id,
        timestamp,
        node_id: nodeId,
        classification: "CRITICAL",
        action: actionType,
        confidence,
      });

      return action;
    }

    if (classification === "NORMAL" && this.state === "REMEDIATING") {
      this.transition("STABILIZED");

      this.pushRingBuffer({
        id: `event-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp,
        node_id: nodeId,
        classification: "NORMAL",
        action: null,
        confidence,
      });
    } else if (classification === "NORMAL" && this.state === "STABILIZED") {
      this.transition("NORMAL");
    }

    return null;
  }

  manualReset(): RemediationAction | null {
    const previousState = this.state;
    this.state = "NORMAL";

    const timestamp = Date.now();
    const action: RemediationAction = {
      id: `manual-reset-${timestamp}`,
      type: "ACTION_MANUAL_RESET",
      node_id: "SYSTEM",
      timestamp,
      metric_spike: "Manual override",
      confidence_score: 1,
      status: "COMPLETED",
      execution_log: `Manual override reset system from ${previousState} to NORMAL`,
    };

    this.pushRingBuffer({
      id: action.id,
      timestamp,
      node_id: "SYSTEM",
      classification: "NORMAL",
      action: "ACTION_MANUAL_RESET",
      confidence: 1,
    });

    return action;
  }
}

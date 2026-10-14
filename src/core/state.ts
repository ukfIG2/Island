export const BOOTSTRAP_STATE_SCHEMA = 'resort-bootstrap-state/v1' as const;

export interface BootstrapState {
  readonly schema: typeof BOOTSTRAP_STATE_SCHEMA;
  readonly bootId: string;
  readonly simulationTick: number;
  readonly elapsedSimulationMs: number;
}

export type BootstrapCommand =
  | {
      readonly type: 'ADVANCE_SIMULATION';
      readonly deltaMs: number;
    };

export function createInitialBootstrapState(
  bootId: string
): BootstrapState {
  return {
    schema: BOOTSTRAP_STATE_SCHEMA,
    bootId,
    simulationTick: 0,
    elapsedSimulationMs: 0
  };
}

export function applyBootstrapCommand(
  state: BootstrapState,
  command: BootstrapCommand
): BootstrapState {
  switch (command.type) {
    case 'ADVANCE_SIMULATION': {
      if (
        !Number.isFinite(command.deltaMs) ||
        command.deltaMs <= 0
      ) {
        throw new Error('BOOTSTRAP_DELTA_INVALID');
      }

      return {
        ...state,
        simulationTick: state.simulationTick + 1,
        elapsedSimulationMs:
          state.elapsedSimulationMs + command.deltaMs
      };
    }
  }
}

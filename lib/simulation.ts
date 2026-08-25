export type IncidentStage =
  | 'verify'
  | 'locate'
  | 'contact'
  | 'escalate'
  | 'recover';

export type SimulationMode =
  | 'idle'
  | 'running'
  | 'paused_for_review'
  | 'completed';

export interface SimulationState {
  mode: SimulationMode;
  activeStage: IncidentStage | null;
  completedStages: IncidentStage[];
}

type SimulationAction =
  | { type: 'START' }
  | { type: 'ADVANCE' }
  | { type: 'APPROVE_CONTACT' }
  | { type: 'RESET' };

const stageOrder: IncidentStage[] = [
  'verify',
  'locate',
  'contact',
  'escalate',
  'recover',
];

export function createSimulationState(): SimulationState {
  return { mode: 'idle', activeStage: null, completedStages: [] };
}

export function simulationReducer(
  state: SimulationState,
  action: SimulationAction,
): SimulationState {
  if (action.type === 'RESET') return createSimulationState();

  if (action.type === 'START') {
    return { mode: 'running', activeStage: 'verify', completedStages: [] };
  }

  if (action.type === 'APPROVE_CONTACT') {
    if (state.activeStage !== 'contact') return state;
    return {
      mode: 'running',
      activeStage: 'escalate',
      completedStages: [...state.completedStages, 'contact'],
    };
  }

  if (action.type !== 'ADVANCE' || !state.activeStage) return state;
  if (state.mode === 'paused_for_review' || state.mode === 'completed') {
    return state;
  }

  const activeIndex = stageOrder.indexOf(state.activeStage);
  const completedStages = [...state.completedStages, state.activeStage];
  const nextStage = stageOrder[activeIndex + 1];

  if (!nextStage) {
    return { mode: 'completed', activeStage: 'recover', completedStages };
  }

  return {
    mode: nextStage === 'contact' ? 'paused_for_review' : 'running',
    activeStage: nextStage,
    completedStages,
  };
}

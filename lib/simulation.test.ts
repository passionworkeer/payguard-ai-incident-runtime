import { describe, expect, it } from 'vitest';
import { createSimulationState, simulationReducer } from './simulation';

describe('incident simulation', () => {
  it('starts at verification and advances in workflow order', () => {
    let state = createSimulationState();
    state = simulationReducer(state, { type: 'START' });
    expect(state.activeStage).toBe('verify');
    expect(state.mode).toBe('running');

    state = simulationReducer(state, { type: 'ADVANCE' });
    expect(state.activeStage).toBe('locate');
  });

  it('pauses for review when merchant contact is prepared', () => {
    let state = createSimulationState();
    state = simulationReducer(state, { type: 'START' });
    state = simulationReducer(state, { type: 'ADVANCE' });
    state = simulationReducer(state, { type: 'ADVANCE' });

    expect(state.activeStage).toBe('contact');
    expect(state.mode).toBe('paused_for_review');
  });

  it('requires approval before escalating and eventually completes recovery', () => {
    let state = createSimulationState();
    state = simulationReducer(state, { type: 'START' });
    state = simulationReducer(state, { type: 'ADVANCE' });
    state = simulationReducer(state, { type: 'ADVANCE' });
    state = simulationReducer(state, { type: 'APPROVE_CONTACT' });
    expect(state.activeStage).toBe('escalate');

    state = simulationReducer(state, { type: 'ADVANCE' });
    expect(state.activeStage).toBe('recover');
    state = simulationReducer(state, { type: 'ADVANCE' });
    expect(state.mode).toBe('completed');
  });
});

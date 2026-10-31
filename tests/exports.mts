import {
  createSnapshot,
  transition,
  type StateMachineDocument,
} from '@lp-labs/react-state-machine';

const machine: StateMachineDocument = {
  initialState: 'ready',
  states: [{ id: 'ready', label: 'Ready' }],
  transitions: [],
};
const snapshot = createSnapshot(machine);
transition(machine, snapshot, 'NOTHING');

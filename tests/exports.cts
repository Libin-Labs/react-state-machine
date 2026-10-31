import machine = require('@lp-labs/react-state-machine');

const model: machine.StateMachineDocument = {
  initialState: 'idle',
  states: [{ id: 'idle', label: 'Idle' }],
  transitions: [],
};
machine.createSnapshot(model);

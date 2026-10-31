const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://test.local/' });
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Event = dom.window.Event;
global.MouseEvent = dom.window.MouseEvent;
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const machineApi = require('../dist/cjs/index.js');

test('validates and deterministically applies guards and context actions', () => {
  const machine = {
    initialState: 'ready',
    context: { tries: 1 },
    states: [
      { id: 'ready', label: 'Ready' },
      { id: 'finished', label: 'Finished', final: true },
    ],
    transitions: [
      {
        id: 'complete',
        from: 'ready',
        to: 'finished',
        event: 'DONE',
        guard: { path: 'context.tries', operator: 'gte', value: 1 },
        actions: { token: { fromEvent: 'meta.token' } },
      },
    ],
  };
  assert.deepEqual(machineApi.validateMachine(machine), []);
  const start = machineApi.createSnapshot(machine);
  const end = machineApi.transition(machine, start, 'DONE', { meta: { token: 'abc' } });
  assert.deepEqual(end, {
    value: 'finished',
    context: { tries: 1, token: 'abc' },
    done: true,
    event: 'DONE',
  });
  assert.equal(machineApi.transition(machine, end, 'DONE'), end);
  assert.equal(machineApi.transition(machine, start, 'OTHER'), start);
  assert.throws(
    () => machineApi.createSnapshot({ ...machine, initialState: 'missing' }),
    /Invalid state machine/,
  );
});

test('ESM and CommonJS entry points expose the same API', async () => {
  const esm = await import('../dist/esm/index.js');
  assert.deepEqual(Object.keys(esm).sort(), Object.keys(machineApi).sort());
});

test('controlled editor emits edits from accessible controls', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  let updated;
  await act(async () =>
    root.render(
      React.createElement(machineApi.StateMachineEditor, {
        value: machineApi.createEmptyMachine(),
        onChange: (value) => {
          updated = value;
        },
      }),
    ),
  );
  const addButton = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === 'Add state',
  );
  await act(async () => addButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  assert.equal(updated.states.length, 2);
  assert.equal(host.querySelector('[aria-label="State machine editor"]') !== null, true);
  await act(async () => root.unmount());
  host.remove();
});

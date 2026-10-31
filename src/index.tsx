import { useEffect, useMemo, useState } from 'react';
import type * as React from 'react';

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type GuardOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'truthy' | 'falsy' | 'in';
export interface Guard {
  path: string;
  operator: GuardOperator;
  value?: JsonValue;
}
export type Assignment = JsonValue | { fromEvent: string };
export interface MachineState {
  id: string;
  label: string;
  final?: boolean;
}
export interface MachineTransition {
  id: string;
  from: string;
  to: string;
  event: string;
  guard?: Guard;
  actions?: Record<string, Assignment>;
}
export interface StateMachineDocument {
  states: MachineState[];
  transitions: MachineTransition[];
  initialState: string;
  context?: Record<string, JsonValue>;
}
export interface ValidationIssue {
  path: string;
  message: string;
}
export interface MachineSnapshot {
  value: string;
  context: Record<string, JsonValue>;
  done: boolean;
  event?: string;
}

function getPath(source: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (value, segment) =>
        value !== null && typeof value === 'object'
          ? (value as Record<string, unknown>)[segment]
          : undefined,
      source,
    );
}

export function validateMachine(machine: StateMachineDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();
  const states = new Set<string>();
  machine.states.forEach((state, index) => {
    if (!state.id.trim())
      issues.push({ path: `states.${index}.id`, message: 'State id is required.' });
    if (states.has(state.id))
      issues.push({ path: `states.${index}.id`, message: `Duplicate state id "${state.id}".` });
    states.add(state.id);
  });
  if (!states.has(machine.initialState))
    issues.push({ path: 'initialState', message: 'Initial state must name an existing state.' });
  machine.transitions.forEach((transition, index) => {
    const path = `transitions.${index}`;
    if (!transition.id.trim())
      issues.push({ path: `${path}.id`, message: 'Transition id is required.' });
    if (ids.has(transition.id))
      issues.push({ path: `${path}.id`, message: `Duplicate transition id "${transition.id}".` });
    ids.add(transition.id);
    if (!states.has(transition.from))
      issues.push({ path: `${path}.from`, message: `Unknown source state "${transition.from}".` });
    if (!states.has(transition.to))
      issues.push({ path: `${path}.to`, message: `Unknown destination state "${transition.to}".` });
    if (!transition.event.trim())
      issues.push({ path: `${path}.event`, message: 'Event name is required.' });
    if (transition.guard && !transition.guard.path.trim())
      issues.push({ path: `${path}.guard.path`, message: 'Guard path is required.' });
    if (
      transition.guard &&
      !['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'truthy', 'falsy', 'in'].includes(
        transition.guard.operator,
      )
    ) {
      issues.push({
        path: `${path}.guard.operator`,
        message: `Unsupported guard operator "${transition.guard.operator}".`,
      });
    }
    for (const [key, assignment] of Object.entries(transition.actions ?? {})) {
      if (
        assignment !== null &&
        typeof assignment === 'object' &&
        !Array.isArray(assignment) &&
        'fromEvent' in assignment &&
        typeof assignment.fromEvent !== 'string'
      ) {
        issues.push({
          path: `${path}.actions.${key}`,
          message: 'Event references must use a string path.',
        });
      }
    }
  });
  return issues;
}

export function createSnapshot(machine: StateMachineDocument): MachineSnapshot {
  const issues = validateMachine(machine);
  if (issues.length)
    throw new Error(`Invalid state machine: ${issues.map((issue) => issue.message).join(' ')}`);
  return {
    value: machine.initialState,
    context: { ...(machine.context ?? {}) },
    done: Boolean(machine.states.find((state) => state.id === machine.initialState)?.final),
  };
}

function guardPasses(
  guard: Guard | undefined,
  context: Record<string, JsonValue>,
  event: unknown,
): boolean {
  if (!guard) return true;
  const actual = getPath({ context, event }, guard.path);
  const expected = guard.value;
  switch (guard.operator) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'gt':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'gte':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'lt':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'lte':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    case 'truthy':
      return Boolean(actual);
    case 'falsy':
      return !actual;
    case 'in':
      return Array.isArray(expected) && expected.includes(actual as JsonValue);
  }
}

export function transition(
  machine: StateMachineDocument,
  snapshot: MachineSnapshot,
  eventName: string,
  event?: unknown,
): MachineSnapshot {
  const issues = validateMachine(machine);
  if (issues.length)
    throw new Error(`Invalid state machine: ${issues.map((issue) => issue.message).join(' ')}`);
  if (snapshot.done) return snapshot;
  const next = machine.transitions.find(
    (item) =>
      item.from === snapshot.value &&
      item.event === eventName &&
      guardPasses(item.guard, snapshot.context, event),
  );
  if (!next) return snapshot;
  const context = { ...snapshot.context };
  for (const [key, assignment] of Object.entries(next.actions ?? {})) {
    const eventPath =
      assignment !== null &&
      typeof assignment === 'object' &&
      !Array.isArray(assignment) &&
      'fromEvent' in assignment
        ? assignment.fromEvent
        : undefined;
    context[key] =
      typeof eventPath === 'string'
        ? ((getPath(event, eventPath) as JsonValue) ?? null)
        : (assignment as JsonValue);
  }
  const target = machine.states.find((state) => state.id === next.to);
  return { value: next.to, context, done: Boolean(target?.final), event: eventName };
}

const starterMachine: StateMachineDocument = {
  states: [
    { id: 'idle', label: 'Idle' },
    { id: 'running', label: 'Running' },
    { id: 'done', label: 'Done', final: true },
  ],
  transitions: [
    { id: 'start', from: 'idle', to: 'running', event: 'START' },
    { id: 'finish', from: 'running', to: 'done', event: 'FINISH' },
  ],
  initialState: 'idle',
  context: {},
};

export interface StateMachineEditorProps {
  value: StateMachineDocument;
  onChange: (value: StateMachineDocument) => void;
  className?: string;
}

export function StateMachineEditor({
  value,
  onChange,
  className,
}: StateMachineEditorProps): React.ReactElement {
  const issues = useMemo(() => validateMachine(value), [value]);
  const [snapshot, setSnapshot] = useState<MachineSnapshot | null>(null);
  const [eventName, setEventName] = useState('');
  const [eventData, setEventData] = useState('{}');
  const [notice, setNotice] = useState('');
  const [contextDraft, setContextDraft] = useState(() =>
    JSON.stringify(value.context ?? {}, null, 2),
  );
  const [contextError, setContextError] = useState('');
  const [transitionDrafts, setTransitionDrafts] = useState<Record<string, string>>({});
  const [transitionErrors, setTransitionErrors] = useState<Record<string, string>>({});
  useEffect(() => setContextDraft(JSON.stringify(value.context ?? {}, null, 2)), [value.context]);
  const updateState = (index: number, patch: Partial<MachineState>) =>
    onChange({
      ...value,
      states: value.states.map((state, i) => (i === index ? { ...state, ...patch } : state)),
    });
  const updateTransition = (index: number, patch: Partial<MachineTransition>) =>
    onChange({
      ...value,
      transitions: value.transitions.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  const updateTransitionJson = (index: number, field: 'guard' | 'actions', raw: string) => {
    const key = `${index}-${field}`;
    try {
      if (!raw.trim()) {
        updateTransition(index, { [field]: undefined });
        setTransitionDrafts((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
        setTransitionErrors((current) => ({ ...current, [key]: '' }));
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(
          field === 'guard' ? 'Guard must be a JSON object.' : 'Actions must be a JSON object.',
        );
      }
      if (field === 'guard') {
        const guard = parsed as Guard;
        if (
          typeof guard.path !== 'string' ||
          !['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'truthy', 'falsy', 'in'].includes(guard.operator)
        ) {
          throw new Error('Guard needs a path and supported operator.');
        }
        updateTransition(index, { guard });
      } else {
        updateTransition(index, { actions: parsed as Record<string, Assignment> });
      }
      setTransitionDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setTransitionErrors((current) => ({ ...current, [key]: '' }));
    } catch (error) {
      setTransitionDrafts((current) => ({ ...current, [key]: raw }));
      setTransitionErrors((current) => ({
        ...current,
        [key]: error instanceof Error ? error.message : 'Invalid JSON.',
      }));
    }
  };

  return (
    <section className={`lp-machine ${className ?? ''}`} aria-label="State machine editor">
      <header className="lp-machine__header">
        <div>
          <h2>State machine</h2>
          <p>Model and simulate deterministic event transitions.</p>
        </div>
        <label>
          Initial state{' '}
          <select
            value={value.initialState}
            onChange={(event) => onChange({ ...value, initialState: event.target.value })}
          >
            {value.states.map((state) => (
              <option key={state.id} value={state.id}>
                {state.label || state.id}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="lp-machine__layout">
        <div className="lp-machine__editor">
          <div className="lp-machine__section-heading">
            <h3>States</h3>
            <button
              type="button"
              onClick={() => {
                let id = `state-${value.states.length + 1}`;
                while (value.states.some((state) => state.id === id)) id += '-new';
                onChange({ ...value, states: [...value.states, { id, label: id }] });
              }}
            >
              Add state
            </button>
          </div>
          <div className="lp-machine__state-list">
            {value.states.map((state, index) => (
              <article className="lp-machine__state" key={`${index}-${state.id}`}>
                <label>
                  Id
                  <input
                    aria-label={`State ${index + 1} id`}
                    value={state.id}
                    onChange={(event) => updateState(index, { id: event.target.value })}
                  />
                </label>
                <label>
                  Label
                  <input
                    aria-label={`State ${index + 1} label`}
                    value={state.label}
                    onChange={(event) => updateState(index, { label: event.target.value })}
                  />
                </label>
                <label className="lp-machine__check">
                  <input
                    aria-label={`State ${state.label || state.id} final`}
                    type="checkbox"
                    checked={Boolean(state.final)}
                    onChange={(event) => updateState(index, { final: event.target.checked })}
                  />{' '}
                  Final
                </label>
                <button
                  type="button"
                  aria-label={`Remove state ${state.label || state.id}`}
                  onClick={() =>
                    onChange({ ...value, states: value.states.filter((_, i) => i !== index) })
                  }
                >
                  Remove
                </button>
              </article>
            ))}
          </div>
          <div className="lp-machine__context">
            <label>
              Initial context JSON
              <textarea
                aria-label="Initial context JSON"
                rows={4}
                value={contextDraft}
                aria-invalid={Boolean(contextError)}
                onChange={(event) => {
                  const raw = event.target.value;
                  setContextDraft(raw);
                  try {
                    const parsed: unknown = JSON.parse(raw);
                    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
                      throw new Error('Context must be a JSON object.');
                    setContextError('');
                    onChange({ ...value, context: parsed as Record<string, JsonValue> });
                  } catch (error) {
                    setContextError(error instanceof Error ? error.message : 'Enter valid JSON.');
                  }
                }}
              />
            </label>
            {contextError && (
              <p className="lp-machine__field-error" role="alert">
                {contextError}
              </p>
            )}
          </div>
          <div className="lp-machine__section-heading">
            <h3>Transitions</h3>
            <button
              type="button"
              onClick={() => {
                const first = value.states[0]?.id ?? '';
                setTransitionDrafts({});
                setTransitionErrors({});
                onChange({
                  ...value,
                  transitions: [
                    ...value.transitions,
                    {
                      id: `transition-${value.transitions.length + 1}`,
                      from: first,
                      to: first,
                      event: 'EVENT',
                    },
                  ],
                });
              }}
            >
              Add transition
            </button>
          </div>
          <div className="lp-machine__transition-list">
            {value.transitions.map((item, index) => (
              <article className="lp-machine__transition" key={`${index}-${item.id}`}>
                <label>
                  Id
                  <input
                    aria-label={`Transition ${index + 1} id`}
                    value={item.id}
                    onChange={(event) => updateTransition(index, { id: event.target.value })}
                  />
                </label>
                <label>
                  Event
                  <input
                    aria-label={`Transition ${index + 1} event`}
                    value={item.event}
                    onChange={(event) => updateTransition(index, { event: event.target.value })}
                  />
                </label>
                <label>
                  From
                  <select
                    aria-label={`Transition ${index + 1} from`}
                    value={item.from}
                    onChange={(event) => updateTransition(index, { from: event.target.value })}
                  >
                    {value.states.map((state) => (
                      <option key={state.id} value={state.id}>
                        {state.label || state.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  To
                  <select
                    aria-label={`Transition ${index + 1} to`}
                    value={item.to}
                    onChange={(event) => updateTransition(index, { to: event.target.value })}
                  >
                    {value.states.map((state) => (
                      <option key={state.id} value={state.id}>
                        {state.label || state.id}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  aria-label={`Remove transition ${item.event}`}
                  onClick={() => {
                    setTransitionDrafts({});
                    setTransitionErrors({});
                    onChange({
                      ...value,
                      transitions: value.transitions.filter((_, i) => i !== index),
                    });
                  }}
                >
                  Remove
                </button>
                <label className="lp-machine__json-field">
                  Guard JSON
                  <input
                    aria-label={`Transition ${index + 1} guard JSON`}
                    value={
                      transitionDrafts[`${index}-guard`] ??
                      (item.guard ? JSON.stringify(item.guard) : '')
                    }
                    placeholder='{"path":"context.allowed","operator":"truthy"}'
                    aria-invalid={Boolean(transitionErrors[`${index}-guard`])}
                    onChange={(event) => updateTransitionJson(index, 'guard', event.target.value)}
                  />
                </label>
                {transitionErrors[`${index}-guard`] && (
                  <p className="lp-machine__field-error" role="alert">
                    {transitionErrors[`${index}-guard`]}
                  </p>
                )}
                <label className="lp-machine__json-field">
                  Actions JSON
                  <input
                    aria-label={`Transition ${index + 1} actions JSON`}
                    value={
                      transitionDrafts[`${index}-actions`] ??
                      (item.actions ? JSON.stringify(item.actions) : '')
                    }
                    placeholder='{"lastId":{"fromEvent":"id"}}'
                    aria-invalid={Boolean(transitionErrors[`${index}-actions`])}
                    onChange={(event) => updateTransitionJson(index, 'actions', event.target.value)}
                  />
                </label>
                {transitionErrors[`${index}-actions`] && (
                  <p className="lp-machine__field-error" role="alert">
                    {transitionErrors[`${index}-actions`]}
                  </p>
                )}
              </article>
            ))}
          </div>
        </div>
        <aside className="lp-machine__simulator" aria-label="Machine simulator">
          <h3>Run a simulation</h3>
          <p>
            Current state: <strong>{snapshot?.value ?? 'Not started'}</strong>
            {snapshot?.done ? ' (final)' : ''}
          </p>
          <label>
            Event
            <input
              value={eventName}
              onChange={(event) => setEventName(event.target.value)}
              placeholder="e.g. START"
            />
          </label>
          <label>
            Event data JSON
            <textarea
              rows={3}
              value={eventData}
              onChange={(event) => setEventData(event.target.value)}
            />
          </label>
          <div className="lp-machine__actions">
            <button
              type="button"
              disabled={issues.length > 0}
              onClick={() => {
                try {
                  setSnapshot(createSnapshot(value));
                  setNotice('Simulation reset.');
                } catch (error) {
                  setNotice(error instanceof Error ? error.message : 'Could not start simulation.');
                }
              }}
            >
              Reset
            </button>
            <button
              type="button"
              disabled={!snapshot || issues.length > 0 || !eventName.trim()}
              onClick={() => {
                if (snapshot) {
                  try {
                    const payload: unknown = JSON.parse(eventData);
                    const next = transition(value, snapshot, eventName, payload);
                    setSnapshot(next);
                    setNotice(
                      next === snapshot
                        ? `No enabled transition for ${eventName}.`
                        : `Transitioned on ${eventName}.`,
                    );
                  } catch (error) {
                    setNotice(
                      error instanceof Error ? error.message : 'Event data must be valid JSON.',
                    );
                  }
                }
              }}
            >
              Send event
            </button>
          </div>
          <p className="lp-machine__notice" role="status">
            {notice}
          </p>
          {snapshot && (
            <pre aria-label="Simulation context">{JSON.stringify(snapshot.context, null, 2)}</pre>
          )}
        </aside>
      </div>
      {issues.length > 0 && (
        <div className="lp-machine__errors" role="alert">
          <strong>Fix before simulation</strong>
          <ul>
            {issues.map((issue, index) => (
              <li key={`${issue.path}-${index}`}>
                {issue.path}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function createEmptyMachine(): StateMachineDocument {
  return {
    states: [{ id: 'idle', label: 'Idle' }],
    transitions: [],
    initialState: 'idle',
    context: {},
  };
}
export { starterMachine };

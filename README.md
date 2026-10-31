# @lp-labs/react-state-machine

Package version: `1.0.0`. Requires React `^18.2.0 || ^19.0.0`
as its only runtime peer. ESM and CommonJS named exports are provided.

```sh
npm install @lp-labs/react-state-machine react
```

A small, independent TypeScript state-machine model, deterministic interpreter, and controlled React editor. The editor uses a keyboard-friendly list view; it does not attempt to render an interactive graph canvas.

## Install and render

```tsx
import { StateMachineEditor, createEmptyMachine } from "@lp-labs/react-state-machine";
import { useState } from "react";
import "@lp-labs/react-state-machine/style.css";

const initial = createEmptyMachine();

function Workflow() {
  const [machine, setMachine] = useState(initial);
  return <StateMachineEditor value={machine} onChange={setMachine} />;
}
```

`StateMachineEditor` is fully controlled: each edit emits a new `StateMachineDocument` through `onChange`; it never mutates the passed document. It edits state and transition IDs, event names, endpoints, final-state markers, initial context, guards, and actions in a keyboard-friendly list. Guard and action fields accept JSON objects. The simulator accepts event data as JSON and can be reset after editing. Supply `className` to add a wrapper class. The stylesheet is optional and can be replaced by custom CSS.

## Document and engine

```ts
import {
  createSnapshot, transition, validateMachine,
  type StateMachineDocument
} from "@lp-labs/react-state-machine";

const machine: StateMachineDocument = {
  initialState: "closed",
  context: { attempts: 0 },
  states: [
    { id: "closed", label: "Closed" },
    { id: "open", label: "Open", final: true }
  ],
  transitions: [{
    id: "open-on-request",
    from: "closed",
    to: "open",
    event: "OPEN",
    guard: { path: "context.attempts", operator: "gte", value: 0 },
    actions: { lastRequestId: { fromEvent: "request.id" } }
  }]
};

const issues = validateMachine(machine); // { path, message }[]
const snapshot = createSnapshot(machine); // { value, context, done }
const next = transition(machine, snapshot, "OPEN", { request: { id: "r-1" } });
```

State IDs and transition IDs must be unique. The initial state and both ends of each transition must exist. Transitions are considered in document order; the first transition matching current state, event, and guard runs. A missing matching transition is a no-op. Final states stop processing. Snapshot creation and transition execution throw `Error` for an invalid document.

Guard paths use dot-separated property access rooted at `{ context, event }` (for example `context.attempts` and `event.user.active`). Supported operators are `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `truthy`, `falsy`, and `in`. Comparison is strict for `eq`/`neq`; numeric comparisons require numbers; `in` expects an array. An action value is JSON data or `{ fromEvent: "path.to.value" }`; the latter reads from the supplied event and writes `null` if absent. Updates copy the top-level context object; nested data is not mutated.

### Complete exports and type contracts

Runtime named exports are `StateMachineEditor`, `createEmptyMachine`,
`starterMachine`, `validateMachine`, `createSnapshot`, and `transition`.
Type-only exports are `JsonValue`, `GuardOperator`, `Guard`, `Assignment`,
`MachineState`, `MachineTransition`, `StateMachineDocument`, `ValidationIssue`,
`MachineSnapshot`, and `StateMachineEditorProps`.

```ts
type JsonValue = null | boolean | number | string | JsonValue[]
  | { [key: string]: JsonValue };
type GuardOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte"
  | "truthy" | "falsy" | "in";
interface Guard { path: string; operator: GuardOperator; value?: JsonValue }
type Assignment = JsonValue | { fromEvent: string };
interface MachineState { id: string; label: string; final?: boolean }
interface MachineTransition {
  id: string;
  from: string;
  to: string;
  event: string;
  guard?: Guard;
  actions?: Record<string, Assignment>;
}
interface StateMachineDocument {
  states: MachineState[];
  transitions: MachineTransition[];
  initialState: string;
  context?: Record<string, JsonValue>;
}
interface ValidationIssue { path: string; message: string }
interface MachineSnapshot {
  value: string;
  context: Record<string, JsonValue>;
  done: boolean;
  event?: string;
}
```

`StateMachineEditorProps` requires `value: StateMachineDocument` and
`onChange: (value: StateMachineDocument) => void`; `className?: string` is the
only optional prop, adding no class by default. There is no `defaultValue`,
snapshot-change callback, or externally controlled simulator state.

- `createEmptyMachine(): StateMachineDocument` returns a fresh machine with
  state `{ id: "idle", label: "Idle" }`, no transitions, initial `"idle"`, and `{}` context.
- `starterMachine` is an exported mutable example document: idle -> running via
  `"START"`, running -> final done via `"FINISH"`, initially idle with `{}` context.
  Clone it before independent editing; it is not a factory or frozen constant.
- `validateMachine(machine: StateMachineDocument): ValidationIssue[]` returns
  model issues. It assumes typed object/array shapes, not arbitrary unknown JSON,
  and does not deeply validate all context data.
- `createSnapshot(machine: StateMachineDocument): MachineSnapshot` validates,
  shallow-copies initial context (default `{}`), and determines `done` from the
  initial state's `final` (default false). Initial `event` is absent.
- `transition(machine, snapshot, eventName: string, event?: unknown): MachineSnapshot`
  validates first, returns the same snapshot object if done/no transition, or a
  new shallow context/snapshot with `event: eventName` after a match.

Absent guards always pass; absent actions perform no assignments. `truthy` and
`falsy` ignore `value`; strict equality on object/array values uses identity, not
deep equality. Action keys assign top-level context properties, not dotted paths.
Do not mutate nested snapshot/context objects expecting isolation: only their
top-level containers are copied. Native errors may escape for malformed data;
document validation failures throw plain Error, not an exported error subclass.

## Validation and limitations

The component reports validation issues before enabling simulation and presents a simple event-driving simulator. Models are flat state lists, not hierarchical or parallel statecharts. There are no async actors, timers, event queues, persistence, history states, nested context assignment, or graph layout. This is a useful modeling primitive, not a production-certification claim.

Controls have visible focus, labels, accessible names, and status/error announcements. Style with the `.lp-machine` and `.lp-machine__*` classes, or omit the stylesheet.

The engine is synchronous, with no background tasks, subscription lifecycle,
worker dependency, or cancellation API. Applications own persistence and event
scheduling; a document edit does not automatically reconcile an existing
simulation snapshot. Import starts no browser work. Mount using your React
application renderer and React TypeScript types; no Node ambient types are
required. Validation and transition search scan document arrays, and the editor
renders them in full; large graphs have no virtualization or throughput promise.

## Project

## License

[MIT](./LICENSE).

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.

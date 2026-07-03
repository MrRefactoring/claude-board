# Split Terminal

Side-by-side or stacked view of two live terminals, for watching multiple running agents at once.

## Behavior
- Lives in the bottom terminal panel's tab bar. Each open task has a tab; the split controls (vertical/horizontal icons) sit on the right side of the bar and are disabled until 2+ tabs are open.
- Clicking **vertical** (`Columns2`) splits side by side; clicking **horizontal** (`Rows2`) splits top/bottom; clicking the active mode's icon again turns split off.
- Enabling split auto-assigns a second (non-active) tab to the split pane if none is set. Once split is active, clicking a tab that isn't already the primary or split tab reassigns it to the split pane; otherwise clicking a tab switches the primary pane.
- Primary pane has no distinct border; the split pane is separated by a border. Closing the split pane's tab exits split mode; closing the primary tab does not.
- The panel height is resizable by dragging the handle above the tab bar. A layout button switches the whole terminal between bottom-panel and side-panel modes (side panel does not support split).

## States & transitions
- `splitMode`: `null` → `vertical` | `horizontal` → `null`
- `splitTabId`: unset while `splitMode` is `null`; auto-populated on split, cleared when split is turned off or the split tab is closed

## Key code
- `client/src/app/TerminalBottomPanel.tsx` — tab bar, split controls, primary/split pane layout
- `client/src/hooks/useTerminalTabs.ts` — `toggleSplit`, `splitMode`, `splitTabId` state
- `client/src/features/terminal/LiveTerminal.tsx` — terminal instance rendered in each pane

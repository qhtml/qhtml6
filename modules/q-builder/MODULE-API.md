# MODULE API — q-builder

## Purpose
Shared visual-builder runtime APIs for `q-builder` plus page-builder harness components used to validate framework capabilities.

Primary implementation lives in:
- `../../dist/q-components/q-builder.qhtml`

## Boundaries
- Owns builder overlays, inspect/edit/source/color dialogs, palette discovery, and palette-driven drop handling.
- Exposes reusable runtime APIs on `q-builder`, `q-builder-palette`, and `globalThis.qbuilder`.
- Owns `dist/page-builder/*` harness components that probe framework-level slot composition and `builderNode()` APIs.
- Page-builder harness does not require `q-builder` runtime internals.
- Does not own QHTML parsing or host mount/update behavior; that remains in `qhtml-runtime`.

## Public definitions

### `q-component q-builder-palette`
- `mode: "floating" | "embedded" | "hidden"`
  - `floating`: movable/resizable standalone palette.
  - `embedded`: fills a host container such as the page-builder sidebar.
  - `hidden`: keeps palette runtime active but hides its panel.
- `setHost(hostElement)`
  - Sets the `<q-html>` host inspected for palette discovery and drops.
- `refresh(hostElement?)`
  - Rebuilds palette entries from discovered/registered `q-*` components.
  - Filters out internal `q-builder*` support components so embedded palettes surface only reusable authoring targets.
- `currentMode()`
  - Returns normalized active mode string.
- `applyLayoutMode()`
  - Reapplies panel layout styles for current mode.

### `q-component q-builder`
- `setInspectMode(enabled, hostElement?)`
  - Enables/disables inspect mode for a host.
- `setPaletteMode(mode)`
  - Applies builder-owned palette mode and persists the preference on the builder element.
- `positionFloatingUi(node, preferredRect, options?)`
  - Clamps floating builder UI into the viewport.
- `listDropTargets(hostElement, targetLike)`
  - Returns normalized slot/drop candidates for a hovered element, raw DOM target, or staged target.
- `stagePaletteDrop(componentName, hostElement, clientX, clientY)`
  - Resolves and stores drop context before commit.
- `commitPaletteDrop(componentName, hostElement, clientX, clientY)`
  - Commits using staged target, slot routing, or root/boundary fallback.
- `commitPaletteDropToSlot(componentName, hostElement, slotName, context?)`
  - Forces a palette drop into an explicit slot.
- `selectParentElement()`
  - Moves the current builder selection to the nearest editable parent element.
- `duplicateSelected()`
  - Duplicates the selected QDOM-backed node immediately after itself and requests a host update.
- `removeSelected()`
  - Removes the selected QDOM-backed node from its parent list and requests a host update.
- `exportSource(hostElement?, options?)`
  - Serializes the active host to QHTML source.
- `openSource(hostElement?)`
  - Populates and opens the builder source modal.
- `openSourceForSelected()`
  - Opens the shared source modal for the active host from the floating toolbar context.
- `isSourceModalVisible()`
  - Returns whether the source modal is currently visible.
- `openSlotPicker(stage)`
  - Shows slot-selection UI for a staged multi-slot drop.
- `chooseSlot(slotName)`
  - Commits the currently staged palette drop into the chosen slot.

### `globalThis.qbuilder`
- `create(target)`
  - Ensures a runtime `q-builder` instance exists for a host and returns it.
- `inspect(target, enabled?)`
  - Enables/disables inspect mode for a host.
- `connectPalette(paletteElement, targetHost)`
  - Connects an external `q-builder-palette` to a host and hides the host-local floating palette.
- `export(target, options?)`
  - Serializes a host to QHTML source.
- `source(target)`
  - Opens the builder source modal for a host.
- `edit(target)`
  - Opens edit UI for the resolved target.
- `show(target)`
  - Convenience wrapper for `inspect(target, true)`.

### `dist/page-builder/page-builder.qhtml` integration components
- `q-component page-builder-runtime`
  - Drag/drop harness runtime for palette entries and canvas targets.
  - Uses framework node APIs (`builderNode().isMouseWithin`, `appendToSlot`, `replaceSlotContent`) for insertion/highlighting.
  - Provides `openSource()` via `QHtml.toQHtmlSource(...)`.
- `q-component q-component-wrapper`
  - Single-slot wrapper abstraction exposing OOP helpers:
    - `highlight`
    - `isMouseWithin`
    - `hasSlots`
    - `hasChildComponent`
    - `hasChildComponentInSlot`
    - `appendToSlot`
    - `replaceSlotContent`
- `q-component page-builder-toolbar-actions`
  - Declarative buttons for source/export and highlight reset.
- `q-component page-builder-sidebar`
  - Local palette UI with draggable widget items (no `q-builder-palette` dependency).
- `q-component page-builder-app`
  - App composition shell that mounts sidebar, sticky toolbar actions, canvas/dropzone, and runtime host.

### `dist/page-builder/page-builder-starter.qhtml` integration components
- `q-component q-page-builder-frame`
  - Three-slot starter frame (`header`, `body`, `footer`) used to validate slot-targeted drops.
- `q-component page-builder-starter-canvas`
  - Seed canvas layout containing nested wrappers and starter widgets for drag/drop probes.

## Side effects
- Appends/removes a runtime `q-builder[q-builder-runtime='1']` inside inspected hosts.
- Adds click/hover/palette drag listeners to inspected hosts and external palettes.
- Opens/closes modal UIs and writes source text into modal controls.
- Uses `QHtml.toQHtmlSource(...)` for source export.
- Uses host-level attribute `data-q-builder-palette-mode` to carry palette visibility preference across delayed runtime creation.
- Page-builder harness adds drag/drop listeners scoped to the harness runtime and toggles highlight classes on drop candidates.

## Cross-module dependencies
- `qhtml-runtime`
  - host `.qdom()` access
  - source export through `QHtml.toQHtmlSource(...)`
  - component registration visibility used by palette discovery
- `qhtml-parser`
  - indirect serialization/parsing support via runtime and editor flows

## Backward compatibility notes
- Embedded palette mode is additive.
- Slot-aware staged drop APIs are additive.
- Raw DOM elements are now accepted by `listDropTargets(...)` and `commitPaletteDropToSlot(...)`.
- Floating toolbar selection actions (`Parent`, `Duplicate`, `Source`, `Delete`) are additive.
- Palette discovery now excludes internal `q-builder*` support components from visible entries.
- Source modal/source export APIs are additive.
- External palette connection now hides the builder-local floating palette instead of leaving both palettes visible.
- External palette disconnect now restores the host's prior palette mode instead of forcing `floating`, preventing duplicate floating palette panels during reconnect flows.

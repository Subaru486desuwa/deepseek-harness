# Agent Note: Sidebar primary action registration

Status: implemented

English | [中文](2026-11-18-sidebar-primary-action.zh.md)

## Problem

A plugin that adds a top-level main panel with its own kind of new item cannot offer that create action where users look for one. The sidebar's New Session button, the macOS window-chrome control, the expanded brand, and the `session.new` shortcut all start a Session. The plugin's create button must sit below the panel list, while the four prominent entry points create something else.

## Decision

ui-sidebar owns the [primary action](../../../../docs/glossary.md#primary-action) and provides `ctx.sidebarPrimaryAction.register(action)`. A registration carries `id`, `label`, `icon`, `run`, an optional `priority`, and an optional `blocked` reason source. The lowest-priority live registration is active, and a same-priority duplicate throws, matching single-slot shadowing. Without a registration, New Session is active, with unchanged behavior, analytics, and `session/create` gating.

All four entry points dispatch through one function. ui-sidebar also registers the `session.new` shortcut instead of ui-workspace. The command id and default bindings are unchanged, so saved keybinding overrides still apply. The catalog label follows the active action, and the shortcut reports a blocked reason instead of running. Plugins supply only the label and an icon component; the sidebar keeps the button, tooltip, shortcut hint, and accessible name.

## Alternatives considered

**A component slot such as `sidebar.primary.action`.** A slot can replace the visible button, but the shortcut and the window-chrome control need a callable action and a blocked state. A component would leave them starting Sessions, or each entry point would need its own slot.

**Two create buttons side by side.** Users would always see both actions, but the top of a narrow column would hold two controls. The shortcut would also need a second binding or a rule for choosing one of them.

**An inline create control on each panel-list row.** It is compact, but hover-revealed controls are hard to discover and unavailable on touch devices. A panel row is a single button, so nesting a second interactive control would change its accessibility semantics.

**A Harness setting for the initial main panel.** A plugin that wants to be the landing panel can select itself once its panel registers. A Harness setting would name a panel that may never register, and the client has no point at which every plugin has finished loading to report it.

## Consequences

A plugin can make its create action the prominent one only while its context is current, and New Session returns as soon as it disposes the registration. Moving the shortcut makes ui-sidebar the owner of a command that ui-workspace used to register; ui-workspace keeps `startSession` as the fallback's implementation. Re-registering the shortcut when the active action changes is the only way to refresh its catalog label, because the shortcut service rereads labels only on registration and locale change. A plugin action is not an official analytics entry, so only New Session clicks are reported.

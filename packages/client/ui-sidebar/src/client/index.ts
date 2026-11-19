/** Registers the sidebar shell and global panel navigation. */
import type {} from '@deepseek-ai/dsh-client-product-analytics/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the Session root standard-props merge.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { SidebarPanelMetadata, SidebarRootInjected } from './contract/slots.ts'
import { SidebarPrimaryActionService } from './primary-action.ts'
import { primaryActionView } from './primary-action-view.tsx'
import { createPanelPins } from './panel-pins.ts'
import { HeaderLeadingControls } from './HeaderLeadingControls.tsx'
import { SidebarRoot } from './SidebarRoot.tsx'
import { en, ja, es, fr, de, ru, pt, zh, type SidebarKey } from './locales.ts'

export type {
  SidebarBrandMarkOwnerProps, SidebarBrandNameOwnerProps, SidebarFooterActionOwnerProps,
  SidebarPanelActionEntry, SidebarPanelActionsOwnerProps, SidebarPanelIconOwnerProps, SidebarPanelMetadata,
  SidebarRootComponentProps, SidebarRootInjected, SidebarSectionOwnerProps, SidebarSettingsOwnerProps,
} from './contract/slots.ts'
export type {
  ActiveSidebarPrimaryAction, SidebarPrimaryAction, SidebarPrimaryActionIconProps, SidebarPrimaryActions,
} from './primary-action.ts'
export type { SidebarKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Sidebar controls and global panel copy. */
    sidebar: SidebarKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'sidebar'

interface WorkspaceNavigation {
  startSession(): void
}

/** Default bindings of the `session.new` command, which runs the primary action. */
const NEW_BINDING = { code: 'KeyN', modifiers: ['primary'] } as const
const NEW_WEB_BINDING = { code: 'KeyN', modifiers: ['primary', 'alt'] } as const

/** Services required by the sidebar plugin. */
export const inject = ['slots', 'layout', 'uiWorkspace', 'locale', 'shortcuts']

/** Registers the sidebar shell and its service callbacks.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  const workspaceNavigation = ctx.get('uiWorkspace') as unknown as WorkspaceNavigation
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-sidebar: dictionaries')
  const panels = createSnapshotStore<readonly SidebarPanelMetadata[]>([])
  const syncPanels = (): void => {
    const next = ctx.slots.entriesOfSlot('sidebar.panellist').map(({ options }) => {
      // The list registration requires an id; StoredEntry erases the slot kind.
      const id = options.id as MainPanelId
      return { id, order: options.order ?? 0, label: resolveSlotLabel(options.label) ?? id }
    }).sort((a, b) => a.order - b.order)
    const previous = panels.getSnapshot()
    if (previous.length === next.length && previous.every((panel, index) => {
      const candidate = next[index] as SidebarPanelMetadata
      return panel.id === candidate.id && panel.order === candidate.order && panel.label === candidate.label
    })) return
    panels.set(next)
  }
  ctx.effect(() => ctx.slots.subscribe('sidebar.panellist', syncPanels), 'ui-sidebar: panel entries')
  ctx.effect(() => ctx.locale.subscribe(syncPanels), 'ui-sidebar: panel labels')
  const panelPins = createPanelPins()
  const entryActions = {
    getSnapshot: () => ctx.slots.entriesOfSlot('sidebar.panellist.actions').length > 0,
    subscribe: (listener: () => void) => ctx.slots.subscribe('sidebar.panellist.actions', listener),
  }

  const primaryActions = new SidebarPrimaryActionService(ctx)
  const runPrimaryAction = (): void => {
    const active = primaryActions.active.getSnapshot()
    // New Session rides the Workspace UI's shared action (current Session Workspace, then recent Workspace).
    if (active === undefined) workspaceNavigation.startSession()
    else if (active.blocked === null) active.action.run()
  }
  installPrimaryShortcut(ctx, primaryActions, runPrimaryAction)

  const injectProps = (): SidebarRootInjected => ({
    runPrimaryAction,
    toggleSidebar: () => { ctx.layout.toggleSidebar() },
    selectPanel: (id) => { ctx.layout.selectPanel(id) },
    setPinned: panelPins.setPinned,
    trackEntryClick: (attributes) => { ctx.get('productAnalytics')?.track('sidebar_menu_click', attributes) },
    hooks: {
      panels, shortcuts: ctx.shortcuts.catalog, entryPins: panelPins.unpinned, entryActions,
      primaryAction: primaryActions.active,
    },
  })
  ctx.slots.inject('sidebar', () => ctx.slots.register({
    name: 'sidebar',
    locale: NS,
    children: {
      'sidebar.brand.mark': { kind: 'single', scope: 'root' },
      'sidebar.brand.name': { kind: 'single', scope: 'root' },
      'sidebar.toggle.badge': { kind: 'single', scope: 'root' },
      'sidebar.panellist': { kind: 'list', scope: 'root' },
      'sidebar.panellist.actions': { kind: 'list', scope: 'root' },
      'sidebar.workspaces': { kind: 'single', scope: 'root' },
      'sidebar.settings': { kind: 'single', scope: 'root' },
      'sidebar.footer.action': { kind: 'list', scope: 'root' },
    },
    inject: injectProps,
  }, SidebarRoot))
  // macOS desktop hides the collapsed sidebar entirely, so the open and
  // primary action controls move into the frame's window-chrome seat beside the
  // traffic lights; the occupant reuses the shell's injected actions, and
  // the AppFrame mounts the seat only while the column is fully hidden.
  ctx.slots.inject('shell.leading', () => ctx.slots.register({
    name: 'shell.leading',
    locale: NS,
    inject: injectProps,
  }, HeaderLeadingControls))
  syncPanels()
}

/**
 * Register `session.new` as the keyboard entry to the primary action. The
 * command id and default bindings stay those of New Session so persisted
 * keybinding overrides keep applying. The catalog reads labels only at
 * registration and locale change, so a new active action re-registers it.
 * @param ctx - Sidebar plugin context; its disposal removes the command.
 * @param primaryActions - The sidebar's primary action registry.
 * @param run - Runs the active primary action.
 */
function installPrimaryShortcut(
  ctx: ClientContext, primaryActions: SidebarPrimaryActionService, run: () => void,
): void {
  const t = ctx.locale.bind(NS)
  const register = (): (() => void) => ctx.shortcuts.register({
    id: 'session.new' as ShortcutCommandId,
    label: () => primaryActionView(primaryActions.active.getSnapshot(), t).label,
    aliases: ['new session', 'new chat'],
    defaults: {
      'desktop:macos': NEW_BINDING, 'desktop:windows': NEW_BINDING, 'desktop:linux': NEW_BINDING,
      'web:macos': NEW_WEB_BINDING, 'web:windows': NEW_WEB_BINDING,
    },
    regions: ['page', 'editable'],
    modals: [],
    resolve: () => {
      const blocked = primaryActions.active.getSnapshot()?.blocked ?? null
      return blocked === null ? { status: 'handled', run } : { status: 'blocked', reason: blocked }
    },
  })
  ctx.effect(() => {
    let current = primaryActions.active.getSnapshot()?.action
    let off = register()
    const stop = primaryActions.active.subscribe(() => {
      const next = primaryActions.active.getSnapshot()?.action
      if (next === current) return
      current = next
      off()
      off = register()
    })
    return () => {
      stop()
      off()
    }
  }, 'ui-sidebar: primary action shortcut')
}

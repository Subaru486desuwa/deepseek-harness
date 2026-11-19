/**
 * Sidebar primary action registry (`ctx.sidebarPrimaryAction`). The primary
 * action is the create action at the top of the sidebar; the sidebar button,
 * the macOS title-bar button, the expanded brand and the `session.new`
 * shortcut all run the active one. With no registration, New Session is active.
 */
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import type { ComponentType } from 'react'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Plugin-provided replacements for the sidebar's New Session primary action. */
    sidebarPrimaryAction: SidebarPrimaryActions
  }
}

/** Icon presentation the sidebar requests from a primary action. */
export interface SidebarPrimaryActionIconProps {
  /** Requested square edge in pixels. */
  size: number
}

/** One plugin-provided primary action. */
export interface SidebarPrimaryAction {
  /** Diagnostics name of the registration. */
  readonly id: string
  /** Button text and accessible name; a function is re-read on each render so it follows the active locale. */
  readonly label: SlotLabel
  /** Glyph drawn by the sidebar inside its own button; it must not be interactive. */
  readonly icon: ComponentType<SidebarPrimaryActionIconProps>
  /**
   * Shadowing rank: ascending, default 0; the lowest live registration is
   * active. Two live registrations with the same priority are a conflict.
   */
  readonly priority?: number
  /** Localized reason the action cannot run now, or null while it can; omitted means always runnable. */
  readonly blocked?: ObservableSnapshot<string | null>
  /** Perform the action. The sidebar never calls it while `blocked` holds a reason. */
  run(): void
}

/** The active registration with its current blocked reason. */
export interface ActiveSidebarPrimaryAction {
  /** The lowest-priority live registration. */
  readonly action: SidebarPrimaryAction
  /** Its current blocked reason, or null while it can run. */
  readonly blocked: string | null
}

/** Service Definition of `ctx.sidebarPrimaryAction`. */
export interface SidebarPrimaryActions {
  /**
   * Register a primary action. Call it inside `ctx.effect()` so the owner's
   * disposal removes it; removing the active registration restores the next
   * one, or New Session when none remain.
   * @param action - The action to offer.
   * @returns The disposer.
   * @throws When another live registration holds the same priority.
   */
  register(action: SidebarPrimaryAction): () => void
}

/**
 * All mutable service state in one holder: cordis service methods run behind
 * the caller-ctx tracker, so mutation goes through one property read.
 */
interface LiveState {
  /** Live registrations, ascending by priority. */
  readonly entries: SidebarPrimaryAction[]
  /** The registration whose blocked source is subscribed. */
  watched: SidebarPrimaryAction | undefined
  /** Unsubscribes the watched blocked source. */
  unwatch: (() => void) | undefined
}

/** Provider of `ctx.sidebarPrimaryAction`, owned by the sidebar plugin. */
export class SidebarPrimaryActionService extends Service implements SidebarPrimaryActions {
  /** Active registration for the sidebar's own entry points; undefined selects New Session. */
  readonly active = createSnapshotStore<ActiveSidebarPrimaryAction | undefined>(undefined, { flush: 'sync' })
  private readonly live: LiveState = { entries: [], watched: undefined, unwatch: undefined }

  /** @param ctx - Sidebar plugin context; its disposal ends the service. */
  constructor(ctx: Context) {
    super(ctx, 'sidebarPrimaryAction')
    ctx.effect(() => () => {
      this.live.unwatch?.()
      this.live.unwatch = undefined
    }, 'ui-sidebar: primary action source')
  }

  register(action: SidebarPrimaryAction): () => void {
    const { live } = this
    const priority = action.priority ?? 0
    const holder = live.entries.find(entry => (entry.priority ?? 0) === priority)
    if (holder !== undefined) {
      throw new Error(`sidebar primary action "${action.id}" conflicts with "${holder.id}" at priority ${priority}`)
    }
    const at = live.entries.findIndex(entry => (entry.priority ?? 0) > priority)
    live.entries.splice(at < 0 ? live.entries.length : at, 0, action)
    this.select()
    return () => {
      const index = live.entries.indexOf(action)
      if (index < 0) return
      live.entries.splice(index, 1)
      this.select()
    }
  }

  private select(): void {
    const { live } = this
    const top = live.entries[0]
    if (top !== live.watched) {
      live.unwatch?.()
      live.watched = top
      live.unwatch = top?.blocked?.subscribe(() => { this.publish() })
    }
    this.publish()
  }

  private publish(): void {
    const top = this.live.watched
    this.active.set(top === undefined ? undefined : { action: top, blocked: top.blocked?.getSnapshot() ?? null })
  }
}

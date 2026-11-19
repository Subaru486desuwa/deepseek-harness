// @vitest-environment jsdom
/** The sidebar primary action through the production slot renderer and shortcut registry. */
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, within } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { ILayout, MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { ShortcutGesture } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TrackProductEvent } from '@deepseek-ai/dsh-client-product-analytics/client'
import { ShortcutRegistry } from '../../shortcuts/src/client/registry.ts'
import { apply, inject } from '../src/client/index.ts'
import type { SidebarPrimaryAction, SidebarPrimaryActionIconProps } from '../src/client/index.ts'

const context = { region: 'page', modal: null, target: null } as const
const newKey: ShortcutGesture = {
  code: 'KeyN', control: false, alt: false, shift: false, meta: true, repeat: false, composing: false, defaultPrevented: false,
}
const runtimes = new Set<SlotTestRuntime>()

afterEach(async () => {
  try {
    for (const runtime of runtimes) await runtime.dispose()
  } finally {
    runtimes.clear()
    cleanup()
  }
})

function ProbeIcon({ size }: SidebarPrimaryActionIconProps) {
  return <svg data-testid="probe-icon" data-size={size} />
}

async function bench() {
  const runtime = await SlotTestRuntime.create()
  runtimes.add(runtime)
  const locale = new LocaleRuntime(runtime.ctx)
  locale.setLocale('en')
  const registry = new ShortcutRegistry('desktop', 'macos')
  const startSession = vi.fn()
  const track = vi.fn<TrackProductEvent>()
  const layout = {
    panelInfo: runtime.panelInfo,
    beginNavigation: vi.fn(() => new AbortController().signal),
    toggleSidebar: vi.fn(),
    selectPanel: vi.fn((activePanelId: MainPanelId | null) => { runtime.panelInfo.set({ activePanelId }) }),
    openRightbar: vi.fn(),
    closeRightbar: vi.fn(),
  } satisfies ILayout
  await runtime.mount({
    inject: ['slots'],
    apply(ctx: Context) {
      ctx.provide('shortcuts', { register: registry.register.bind(registry), catalog: registry.catalog } as never)
      ctx.provide('layout', layout)
      ctx.provide('uiWorkspace', { startSession } as never)
      ctx.provide('locale', locale)
      ctx.provide('productAnalytics', { track } as never)
      ctx.effect(() => locale.register('common', { zh: commonZh, en: commonEn }), 'primary action test: common locale')
      ctx.slots.installLocale(locale)
    },
  })
  function Frame({ renderSlot }: PropsRuntime<'root'> & PropsRenderSlots<'sidebar' | 'shell.leading'>) {
    return (
      <>
        <aside>{renderSlot('sidebar', { collapsed: false, width: 300 })}</aside>
        <header>{renderSlot('shell.leading', {})}</header>
      </>
    )
  }
  await runtime.root.declare({
    'sidebar': { kind: 'single', scope: 'root' },
    'shell.leading': { kind: 'single', scope: 'root' },
  }, Frame)
  const sidebar = await runtime.mount({ inject: [...inject], apply })
  const view = runtime.renderRoot()
  /** Register a primary action from its own plugin owner. */
  const offer = async (action: Omit<SidebarPrimaryAction, 'icon'>) => runtime.mount({
    inject: ['sidebarPrimaryAction'],
    apply(ctx: Context) {
      ctx.effect(() => ctx.sidebarPrimaryAction.register({ icon: ProbeIcon, ...action }), `primary action test: ${action.id}`)
    },
  })
  const sidebarButtons = (name: string) => within(view.container.querySelector('aside')!).queryAllByRole('button', { name })
  const titlebarButton = (name: string) => within(view.container.querySelector('header')!).queryByRole('button', { name })
  const catalogLabel = () => registry.catalog.getSnapshot().find(row => row.id === 'session.new')?.label
  const pressNew = () => registry.dispatch(newKey, context, () => {})
  return { runtime, sidebar, view, startSession, track, offer, sidebarButtons, titlebarButton, catalogLabel, pressNew }
}

describe('sidebar primary action', () => {
  it('is New Session at every entry point while no plugin offers one', async () => {
    const b = await bench()
    // The expanded brand and the capsule, plus the window-chrome control.
    expect(b.sidebarButtons('New session')).toHaveLength(2)
    for (const button of b.sidebarButtons('New session')) fireEvent.click(button)
    fireEvent.click(b.titlebarButton('New session')!)
    expect(b.catalogLabel()).toBe('New Session')
    expect(b.pressNew().status).toBe('handled')
    expect(b.startSession).toHaveBeenCalledTimes(4)
    expect(b.track.mock.calls.map(([, attributes]) => attributes)).toEqual([
      { menu_name: 'new_session', position: 'sidebar' },
      { menu_name: 'new_session', position: 'sidebar' },
      { menu_name: 'new_session', position: 'titlebar' },
    ])
  })

  it('runs a plugin action from every entry point and restores New Session when its owner is disposed', async () => {
    const b = await bench()
    const run = vi.fn()
    const owner = await b.offer({ id: 'probe', label: () => 'New probe', run })
    expect(b.sidebarButtons('New session')).toEqual([])
    const [brand, capsule] = b.sidebarButtons('New probe')
    expect(capsule!.textContent).toContain('New probe')
    expect(within(capsule!).getByTestId('probe-icon').getAttribute('data-size')).toBe('14')
    fireEvent.click(brand!)
    fireEvent.click(capsule!)
    fireEvent.click(b.titlebarButton('New probe')!)
    expect(within(b.titlebarButton('New probe')!).getByTestId('probe-icon').getAttribute('data-size')).toBe('16')
    expect(b.catalogLabel()).toBe('New probe')
    expect(b.pressNew().status).toBe('handled')
    expect(run).toHaveBeenCalledTimes(4)
    // A plugin action is not an official analytics entry and does not start a Session.
    expect(b.startSession).not.toHaveBeenCalled()
    expect(b.track).not.toHaveBeenCalled()

    await act(async () => { await owner.dispose() })
    expect(b.sidebarButtons('New session')).toHaveLength(2)
    expect(b.catalogLabel()).toBe('New Session')
    b.pressNew()
    expect(b.startSession).toHaveBeenCalledOnce()
    expect(run).toHaveBeenCalledTimes(4)
  })

  it('activates the lowest priority and refuses a second registration at the same priority', async () => {
    const b = await bench()
    const low = vi.fn()
    const high = vi.fn()
    const lower = await b.offer({ id: 'lower-rank', label: 'Lower rank', priority: -1, run: low })
    // A later registration at a higher priority waits behind the active one.
    await b.offer({ id: 'default-rank', label: 'Default rank', run: high })
    b.pressNew()
    expect(low).toHaveBeenCalledOnce()
    expect(b.sidebarButtons('Lower rank')).toHaveLength(2)
    expect(() => b.runtime.ctx.sidebarPrimaryAction.register({ id: 'clash', label: 'Clash', icon: ProbeIcon, run: vi.fn() }))
      .toThrow('sidebar primary action "clash" conflicts with "default-rank" at priority 0')
    await act(async () => { await lower.dispose() })
    b.pressNew()
    expect(high).toHaveBeenCalledOnce()
    expect(b.sidebarButtons('Default rank')).toHaveLength(2)
  })

  it('treats a repeated disposer call as a no-op', async () => {
    const b = await bench()
    const service = b.runtime.ctx.sidebarPrimaryAction
    const first = vi.fn()
    const second = vi.fn()
    const offSecond = service.register({ id: 'second', label: 'Second', icon: ProbeIcon, run: second })
    // A lower priority registered later takes over ahead of the existing one.
    const offFirst = service.register({ id: 'first', label: 'First', priority: -1, icon: ProbeIcon, run: first })
    offFirst()
    offFirst()
    b.pressNew()
    expect(second).toHaveBeenCalledOnce()
    expect(first).not.toHaveBeenCalled()
    offSecond()
    b.pressNew()
    expect(b.startSession).toHaveBeenCalledOnce()
  })

  it('disables the controls and blocks the shortcut with the plugin reason while the action is blocked', async () => {
    const b = await bench()
    const run = vi.fn()
    const blocked = createSnapshotStore<string | null>('Busy', { flush: 'sync' })
    await b.offer({ id: 'probe', label: 'New probe', blocked, run })
    const capsule = b.sidebarButtons('New probe').find(button => button.textContent?.includes('New probe'))!
    expect((capsule as HTMLButtonElement).disabled).toBe(true)
    expect((b.titlebarButton('New probe') as HTMLButtonElement).disabled).toBe(true)
    expect(b.pressNew()).toMatchObject({ status: 'blocked', reason: 'Busy' })
    // The brand stays a button; clicking it while blocked runs nothing.
    fireEvent.click(b.sidebarButtons('New probe').find(button => button !== capsule)!)
    expect(run).not.toHaveBeenCalled()
    act(() => { blocked.set(null) })
    expect((capsule as HTMLButtonElement).disabled).toBe(false)
    expect(b.pressNew().status).toBe('handled')
    expect(run).toHaveBeenCalledOnce()
  })

  it('removes the shortcut and the service with the sidebar plugin', async () => {
    const b = await bench()
    expect(b.catalogLabel()).toBe('New Session')
    await b.sidebar.dispose()
    expect(b.catalogLabel()).toBeUndefined()
    expect(b.runtime.ctx.get('sidebarPrimaryAction')).toBeUndefined()
  })
})

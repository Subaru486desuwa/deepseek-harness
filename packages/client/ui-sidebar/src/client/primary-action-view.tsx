/** Presentation of the active primary action, shared by the sidebar column and the title-bar seat. */
import type { ReactNode } from 'react'
import { IconNewChatOutlineMedium, IconNewChatOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ActiveSidebarPrimaryAction } from './primary-action.ts'

/** What a control shows for the active primary action. */
export interface PrimaryActionView {
  /** Visible button text. */
  readonly label: string
  /** Accessible name and tooltip text. */
  readonly ariaLabel: string
  /** Whether the active action currently refuses to run. */
  readonly blocked: boolean
  /**
   * Render the action's glyph.
   * @param size - Square edge in pixels.
   * @param weight - New Session's stroke weight; plugin icons receive only the size.
   * @returns The glyph element.
   */
  glyph(size: number, weight: 'medium' | 'regular'): ReactNode
}

/**
 * Describe the active primary action, or New Session when no plugin registration is active.
 * @param active - Active plugin registration, or undefined.
 * @param t - Sidebar dictionary lookup.
 * @returns The view facts each control renders.
 */
export function primaryActionView(active: ActiveSidebarPrimaryAction | undefined, t: PropsLocale<'sidebar'>['t']): PrimaryActionView {
  if (active === undefined) {
    return {
      label: t('session.new'),
      ariaLabel: t('session.new.label'),
      blocked: false,
      glyph: (size, weight) => weight === 'medium' ? <IconNewChatOutlineMedium size={size} /> : <IconNewChatOutlineRegular size={size} />,
    }
  }
  const { action, blocked } = active
  const label = typeof action.label === 'string' ? action.label : action.label()
  const Icon = action.icon
  return { label, ariaLabel: label, blocked: blocked !== null, glyph: size => <Icon size={size} /> }
}

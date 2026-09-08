/**
 * How a social platform reads on the public site — a small coloured pill
 * with the platform's own mark, not a hand-drawn approximation.
 *
 * lucide-react (already a dependency here) ships an `X` glyph but nothing
 * for LinkedIn or Instagram, which is what the badge used to fall back to
 * text-only for every platform rather than mixing one real icon with two
 * missing ones. react-icons' Font Awesome 6 set (`react-icons/fa6`) covers
 * all three as real, recognisable brand marks, so that inconsistency is
 * gone rather than papered over.
 */

import { FaXTwitter, FaLinkedin, FaInstagram } from 'react-icons/fa6'
import type { SocialPostSummary } from '../repository/contract'

export type SocialPlatform = SocialPostSummary['platform']

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  x: 'X',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
}

const PLATFORM_ICON: Record<SocialPlatform, React.ComponentType<{ size?: number }>> = {
  x: FaXTwitter,
  linkedin: FaLinkedin,
  instagram: FaInstagram,
}

export function SocialBadge({ platform, iconOnly = false }: { platform: SocialPlatform; iconOnly?: boolean }) {
  const Icon = PLATFORM_ICON[platform]
  // X's brand mark is the letter X — pairing the icon with the text label
  // "X" reads as a typo ("X X"), not as reinforcement, the way LinkedIn's
  // "in" glyph or Instagram's camera icon pairing with their name doesn't.
  // The icon alone already says everything the label would.
  const showLabel = !iconOnly && platform !== 'x'
  return (
    <span
      className={'social-badge social-badge-' + platform + (iconOnly ? ' social-badge-icon-only' : '')}
      title={PLATFORM_LABEL[platform]}
    >
      <Icon size={12} />
      {showLabel && PLATFORM_LABEL[platform]}
    </span>
  )
}

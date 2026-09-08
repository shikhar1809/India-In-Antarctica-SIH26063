/**
 * How a social platform reads on the public site — a small coloured pill,
 * not a hand-drawn brand logo.
 *
 * The portal itself never draws platform icons anywhere (studio/brand.ts's
 * PLATFORM_LIMITS is text labels only), and lucide-react — already a
 * dependency here — ships an `X` glyph but no LinkedIn or Instagram mark.
 * A mix of one real lucide icon and two hand-approximated ones would read
 * as more official than either actually is; matching the portal's own
 * choice (text, consistently) is the safer and more honest option.
 *
 * Colour here is identity, not encoded data — unlike a chart series, "which
 * platform" IS the fact being shown, so a fixed colour per platform is the
 * label, not decoration standing in for one.
 */

import type { SocialPostSummary } from '../repository/contract'

export type SocialPlatform = SocialPostSummary['platform']

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  x: 'X',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
}

export function SocialBadge({ platform }: { platform: SocialPlatform }) {
  return <span className={'social-badge social-badge-' + platform}>{PLATFORM_LABEL[platform]}</span>
}

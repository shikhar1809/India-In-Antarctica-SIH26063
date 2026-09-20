/**
 * The gallery a site manager curates in the portal (Site → Edit gallery).
 *
 * Stored as one document in the CMS collection — `publicSiteData/gallery` —
 * so it arrives the same way the rest of the editable site does, and is
 * world-readable by the same rule.
 *
 * Curated media leads; the built-in set (lib/galleryArt.ts and the curated
 * stock films) stays behind it as fill. A page that empties itself the
 * moment someone adds their first photograph would be a worse page, and a
 * gallery that silently drops to three items because Firestore was slow is
 * worse still.
 */

import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

export interface SiteGalleryItem {
  id: string
  kind: 'photo' | 'video'
  url: string
  title: string
  caption: string
  credit: string
  addedAt: number
}

export function useSiteGallery(): { photos: SiteGalleryItem[]; videos: SiteGalleryItem[] } {
  const [items, setItems] = useState<SiteGalleryItem[]>([])

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'publicSiteData', 'gallery'),
      (snap) => {
        const raw = (snap.data() as { items?: SiteGalleryItem[] } | undefined)?.items ?? []
        // A half-filled row (no URL yet) is not something to render.
        setItems(raw.filter((i) => i && typeof i.url === 'string' && i.url.trim()))
      },
      () => setItems([]),
    )
    return unsub
  }, [])

  return {
    photos: items.filter((i) => i.kind === 'photo'),
    videos: items.filter((i) => i.kind === 'video'),
  }
}

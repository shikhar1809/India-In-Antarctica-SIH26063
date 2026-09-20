/**
 * The public site's gallery, managed.
 *
 * Until now the only thing the portal could change about the public site was
 * its blocks and its records — the Gallery page ran on a fixed set of
 * photographs and stock videos compiled into the build, so adding one meant a
 * developer and a deploy. This is the other half of "site manager": the
 * pictures and films the public sees, edited from the portal.
 *
 * It is stored as ONE document, `publicSiteData/gallery`, alongside the rest
 * of the CMS content — same collection, same rule (admins and site managers
 * write, everyone reads), so no new security surface is introduced for what
 * is, in the end, more site content. Files go to Storage under the uploader's
 * own uid, like every other upload in this project.
 *
 * A video may also be added by link. Station footage often already lives on a
 * CDN or a stock library, and pushing a 200 MB file through a browser to
 * re-host it is worse for everyone than pointing at the original.
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Film, GripVertical, Image as ImageIcon, Link2, Trash2, Upload } from 'lucide-react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { db, storage } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../hooks/useRole';
import './SiteGallery.css';

export interface GalleryItem {
  id: string;
  kind: 'photo' | 'video';
  url: string;
  title: string;
  caption: string;
  /** Who took it. Shown on the public page; required by most licences. */
  credit: string;
  /** Set when the file was uploaded here rather than linked. */
  storagePath?: string | null;
  addedAt: number;
  addedBy: string;
}

export const GALLERY_DOC = 'gallery';

const MAX_PHOTO_MB = 15;
const MAX_VIDEO_MB = 200;

export function SiteGallery() {
  const { user } = useAuth();
  const { role, permissions, loading: roleLoading } = useRole();
  const canManage = role === 'admin' || permissions.siteAccess;

  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'photo' | 'video'>('photo');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'publicSiteData', GALLERY_DOC),
      (snap) => {
        const data = snap.data() as { items?: GalleryItem[] } | undefined;
        setItems(data?.items ?? []);
        setLoading(false);
      },
      (e) => { setError(e.message); setLoading(false); },
    );
    return unsub;
  }, []);

  /** The whole list, written at once — a gallery is an ordered thing, and
   *  order is the document, not a field to sort by afterwards. */
  const save = async (next: GalleryItem[]) => {
    setItems(next);                       // optimistic; the listener confirms
    try {
      await setDoc(doc(db, 'publicSiteData', GALLERY_DOC), { items: next, updatedAt: Date.now() }, { merge: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the gallery.');
    }
  };

  const addFile = async (file: File) => {
    if (!user) return;
    const isVideo = file.type.startsWith('video/');
    const isPhoto = file.type.startsWith('image/');
    if (!isVideo && !isPhoto) { setError('That file is neither a picture nor a video.'); return; }
    const capMb = isVideo ? MAX_VIDEO_MB : MAX_PHOTO_MB;
    if (file.size > capMb * 1024 * 1024) {
      setError(`${file.name} is ${Math.round(file.size / 1024 / 1024)} MB — the limit is ${capMb} MB. For a large film, add it by link instead.`);
      return;
    }

    setError(null);
    const path = `siteGallery/${user.uid}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
    try {
      const task = uploadBytesResumable(ref(storage, path), file, { contentType: file.type });
      await new Promise<void>((resolve, reject) => {
        task.on('state_changed',
          (s) => setProgress(`Uploading ${file.name} — ${Math.round((s.bytesTransferred / s.totalBytes) * 100)}%`),
          reject,
          () => resolve());
      });
      const url = await getDownloadURL(task.snapshot.ref);
      await save([...items, {
        id: crypto.randomUUID(),
        kind: isVideo ? 'video' : 'photo',
        url,
        title: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
        caption: '',
        credit: '',
        storagePath: path,
        addedAt: Date.now(),
        addedBy: user.displayName ?? user.email ?? user.uid,
      }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The upload failed.');
    } finally {
      setProgress(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const addLink = async () => {
    if (!user) return;
    const url = linkUrl.trim();
    if (!/^https?:\/\//i.test(url)) { setError('A link has to start with http:// or https://'); return; }
    setError(null);
    setLinkUrl('');
    await save([...items, {
      id: crypto.randomUUID(),
      kind: tab,
      url,
      title: '',
      caption: '',
      credit: '',
      storagePath: null,
      addedAt: Date.now(),
      addedBy: user.displayName ?? user.email ?? user.uid,
    }]);
  };

  const edit = (id: string, field: 'title' | 'caption' | 'credit', value: string) =>
    save(items.map((i) => (i.id === id ? { ...i, [field]: value } : i)));

  /* Taken off the public page, and the file left in Storage. Deleting the
   * object as well would break any record or post that already points at it,
   * and a few megabytes is a much smaller problem than a dead image. */
  const remove = (id: string) => save(items.filter((i) => i.id !== id));

  const move = (id: string, by: -1 | 1) => {
    const at = items.findIndex((i) => i.id === id);
    const to = at + by;
    if (at < 0 || to < 0 || to >= items.length) return;
    const next = [...items];
    [next[at], next[to]] = [next[to], next[at]];
    save(next);
  };

  if (!roleLoading && !canManage) {
    return <main className="ph-page"><p className="fld-empty">The gallery is managed by admins and site managers.</p></main>;
  }

  const shown = items.filter((i) => i.kind === tab);
  const photos = items.filter((i) => i.kind === 'photo').length;
  const videos = items.length - photos;

  return (
    <main className="ph-page sg-page">
      <header className="sg-head">
        <Link to="/site" className="sg-back"><ArrowLeft size={15} /> Site</Link>
        <div>
          <h1>Gallery</h1>
          <p>
            The photographs and films on the public site's Gallery page. What you add here appears
            there immediately, ahead of the built-in set.{' '}
            <a href="https://iia-public.web.app/gallery" target="_blank" rel="noreferrer">See the page</a>
          </p>
        </div>
      </header>

      <div className="sg-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'photo'} className={tab === 'photo' ? 'is-on' : ''} onClick={() => setTab('photo')}>
          <ImageIcon size={14} /> Photos <b>{photos}</b>
        </button>
        <button role="tab" aria-selected={tab === 'video'} className={tab === 'video' ? 'is-on' : ''} onClick={() => setTab('video')}>
          <Film size={14} /> Videos <b>{videos}</b>
        </button>
      </div>

      <div className="sg-add">
        <label className="sg-upload">
          <Upload size={15} />
          {tab === 'photo' ? `Upload a photograph (up to ${MAX_PHOTO_MB} MB)` : `Upload a film (up to ${MAX_VIDEO_MB} MB)`}
          <input
            ref={fileRef}
            type="file"
            accept={tab === 'photo' ? 'image/*' : 'video/*'}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void addFile(f); }}
          />
        </label>

        <div className="sg-link">
          <Link2 size={15} />
          <input
            type="url"
            placeholder={tab === 'photo' ? '…or paste a link to a photograph' : '…or paste a link to a film (MP4)'}
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void addLink(); }}
          />
          <button type="button" className="ph-btn ghost" onClick={() => void addLink()} disabled={!linkUrl.trim()}>Add</button>
        </div>
      </div>

      {progress && <p className="sg-progress">{progress}</p>}
      {error && <p className="fld-error sg-error">{error}</p>}

      {loading ? (
        <p className="fld-empty">Loading the gallery…</p>
      ) : shown.length === 0 ? (
        <p className="fld-empty">
          No {tab === 'photo' ? 'photographs' : 'films'} added yet. The public page is showing its
          built-in set until you add some.
        </p>
      ) : (
        <ul className="sg-list">
          {shown.map((item) => (
            <li key={item.id} className="sg-item">
              <div className="sg-media">
                {item.kind === 'photo'
                  ? <img src={item.url} alt="" />
                  : <video src={item.url} muted playsInline preload="metadata" />}
              </div>

              <div className="sg-fields">
                <label>
                  <span>Title</span>
                  <input value={item.title} placeholder="Icebergs off Bharati" onChange={(e) => edit(item.id, 'title', e.target.value)} />
                </label>
                <label>
                  <span>Caption</span>
                  <input value={item.caption} placeholder="What a visitor is looking at" onChange={(e) => edit(item.id, 'caption', e.target.value)} />
                </label>
                <label>
                  <span>Credit</span>
                  <input value={item.credit} placeholder="Photograph by…" onChange={(e) => edit(item.id, 'credit', e.target.value)} />
                </label>
                <p className="sg-meta">
                  Added {new Date(item.addedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} by {item.addedBy}
                  {item.storagePath ? '' : ' · linked, not uploaded'}
                </p>
              </div>

              <div className="sg-actions">
                <span className="sg-order" title="Order on the public page">
                  <GripVertical size={13} />
                  <button type="button" onClick={() => move(item.id, -1)} aria-label="Move earlier">↑</button>
                  <button type="button" onClick={() => move(item.id, 1)} aria-label="Move later">↓</button>
                </span>
                <button type="button" className="sg-remove" onClick={() => remove(item.id)}>
                  <Trash2 size={13} /> Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default SiteGallery;

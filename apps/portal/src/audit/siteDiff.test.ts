import { describe, it, expect } from 'vitest';
import { diffSitePage, type PageData } from './siteDiff';

const hero = { type: 'HeroBlock', props: { id: 'hero-1', heading: 'Welcome to IIA', body: 'Old body' } };
const banner = { type: 'BannerBlock', props: { id: 'banner-1', heading: 'Experience the Expedition' } };
const gallery = { type: 'GalleryBlock', props: { id: 'gallery-1', title: 'Field photos' } };

const page = (...content: object[]): PageData => ({ content, root: { props: {} } });

describe('diffSitePage', () => {
  it('reports nothing for an unchanged page', () => {
    expect(diffSitePage(page(hero, banner), page(hero, banner))).toEqual([]);
  });

  it('names the block and the fields that were edited', () => {
    const edited = { ...hero, props: { ...hero.props, body: 'New body' } };
    expect(diffSitePage(page(hero), page(edited))).toEqual(['Edited Hero “Welcome to IIA”: body']);
  });

  it('reports added and removed blocks by name', () => {
    expect(diffSitePage(page(hero, banner), page(hero, gallery))).toEqual([
      'Added Gallery “Field photos”',
      'Removed Banner “Experience the Expedition”',
    ]);
  });

  it('treats a drag as a reorder, not as edits', () => {
    expect(diffSitePage(page(hero, banner), page(banner, hero))).toEqual(['Reordered blocks']);
  });

  it('handles a first save with nothing before it', () => {
    expect(diffSitePage(null, page(hero))).toEqual(['Added Hero “Welcome to IIA”']);
  });
});

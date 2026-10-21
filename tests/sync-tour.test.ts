import { describe, expect, it } from 'vitest';
import { chapterOf, setTourStep, startTour, SYNC_TOUR, TOURS, tourText } from '@/features/tour';

describe('sync tour', () => {
  it('lives on the Settings → Sync tab and only points at markers that are always on screen', () => {
    for (const s of SYNC_TOUR) {
      expect(s.screen).toBe('settings');
      expect(s.section).toBe('sync');
      if (s.target) expect(['sync-panel', 'sync-methods', 'sync-detail']).toContain(s.target);
    }
    // Every step belongs to a chapter chip, and chapters never go backwards.
    const ids = TOURS.sync.chapters.map((c) => c.id);
    const order = SYNC_TOUR.map((s) => ids.indexOf(chapterOf(s)));
    expect(order.every((n) => n >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('greets by name on the last step', () => {
    expect(tourText(SYNC_TOUR.at(-1)!.text, {}, 'Ana')).toContain('Ana');
  });

  it('starts, ends and survives being handed a click event', () => {
    startTour('sync');
    setTourStep(1);
    setTourStep(SYNC_TOUR.length); // past the end closes it
    // An onClick handler passes an event object: that must start the main tour, not crash.
    startTour({} as never);
    setTourStep(null);
  });
});

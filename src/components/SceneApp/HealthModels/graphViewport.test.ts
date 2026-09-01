import {
  canPan,
  clampScale,
  clampTransform,
  fitTransform,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  zoomAt,
} from './graphViewport';

describe('clampScale', () => {
  it('keeps the zoom within the supported range', () => {
    expect(clampScale(0.01)).toBe(MIN_ZOOM);
    expect(clampScale(99)).toBe(MAX_ZOOM);
    expect(clampScale(1.5)).toBe(1.5);
  });
});

describe('fitTransform', () => {
  it('scales a large graph down until it fits and centres it', () => {
    const transform = fitTransform({ width: 1000, height: 500 }, { width: 500, height: 500 });

    expect(transform.scale).toBe(0.5);
    expect(transform.x).toBe(0);
    expect(transform.y).toBe(125);
  });

  it('never enlarges a graph that already fits', () => {
    const transform = fitTransform({ width: 100, height: 100 }, { width: 500, height: 400 });

    expect(transform.scale).toBe(1);
    expect(transform).toMatchObject({ x: 200, y: 150 });
  });

  it('leaves room for the padding', () => {
    const transform = fitTransform({ width: 1000, height: 100 }, { width: 500, height: 500 }, 50);

    expect(transform.scale).toBe(0.4);
  });

  it('falls back to an identity transform before the viewport has been measured', () => {
    expect(fitTransform({ width: 100, height: 100 }, { width: 0, height: 0 })).toEqual({ x: 0, y: 0, scale: 1 });
  });
});

describe('zoomAt', () => {
  it('keeps the content under the pointer pinned', () => {
    const before = { x: 0, y: 0, scale: 1 };
    const after = zoomAt(before, 2, 100, 50);

    // The content point under the pointer is (100, 50) before and must stay there after.
    expect(after.x + 100 * after.scale).toBe(100);
    expect(after.y + 50 * after.scale).toBe(50);
  });

  it('respects the zoom limits', () => {
    expect(zoomAt({ x: 0, y: 0, scale: MAX_ZOOM }, 2, 0, 0).scale).toBe(MAX_ZOOM);
    expect(zoomAt({ x: 0, y: 0, scale: MIN_ZOOM }, 0.5, 0, 0).scale).toBe(MIN_ZOOM);
  });
});

describe('panBy', () => {
  it('moves the graph without changing the zoom', () => {
    expect(panBy({ x: 10, y: 20, scale: 2 }, 5, -5)).toEqual({ x: 15, y: 15, scale: 2 });
  });
});

describe('clampTransform', () => {
  const viewport = { width: 400, height: 300 };

  it('centres an axis that is smaller than the viewport', () => {
    const clamped = clampTransform({ x: 999, y: -999, scale: 1 }, { width: 200, height: 100 }, viewport);

    expect(clamped).toEqual({ x: 100, y: 100, scale: 1 });
  });

  it('stops a large graph being dragged past its own edges', () => {
    const content = { width: 1000, height: 900 };

    expect(clampTransform({ x: 200, y: 200, scale: 1 }, content, viewport)).toMatchObject({ x: 0, y: 0 });
    expect(clampTransform({ x: -5000, y: -5000, scale: 1 }, content, viewport)).toMatchObject({ x: -600, y: -600 });
  });

  it('accounts for the current zoom when deciding whether the graph overflows', () => {
    const content = { width: 1000, height: 900 };

    // At 0.2x the graph is 200x180, so it fits and is centred despite the offset.
    expect(clampTransform({ x: -300, y: -300, scale: 0.2 }, content, viewport)).toMatchObject({ x: 100, y: 60 });
  });
});

describe('canPan', () => {
  const viewport = { width: 400, height: 300 };
  const content = { width: 1000, height: 900 };

  it('is true while the graph still has room to move', () => {
    expect(canPan({ x: 0, y: 0, scale: 1 }, content, viewport, 0, 50)).toBe(true);
  });

  it('is false at the edge, so the surrounding page can scroll instead', () => {
    expect(canPan({ x: 0, y: 0, scale: 1 }, content, viewport, 0, -50)).toBe(false);
    expect(canPan({ x: -600, y: -600, scale: 1 }, content, viewport, 0, 50)).toBe(false);
  });

  it('is false when the whole graph already fits', () => {
    expect(canPan({ x: 100, y: 100, scale: 1 }, { width: 200, height: 100 }, viewport, 0, 50)).toBe(false);
  });
});

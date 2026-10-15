import { SlidingWindowLimiter } from './sliding-window-limiter';

describe('SlidingWindowLimiter', () => {
  it('allows up to `limit` hits per window and then refuses', () => {
    const limiter = new SlidingWindowLimiter(3, 1000);

    expect(limiter.tryAcquire('ip', 0)).toBe(true);
    expect(limiter.tryAcquire('ip', 100)).toBe(true);
    expect(limiter.tryAcquire('ip', 200)).toBe(true);
    expect(limiter.tryAcquire('ip', 300)).toBe(false);
  });

  it('forgets hits once they leave the window', () => {
    const limiter = new SlidingWindowLimiter(2, 1000);

    limiter.tryAcquire('ip', 0);
    limiter.tryAcquire('ip', 500);
    expect(limiter.tryAcquire('ip', 900)).toBe(false);
    expect(limiter.tryAcquire('ip', 1001)).toBe(true); // first hit expired
    expect(limiter.tryAcquire('ip', 1002)).toBe(false);
  });

  it('counts keys independently', () => {
    const limiter = new SlidingWindowLimiter(1, 1000);

    expect(limiter.tryAcquire('a', 0)).toBe(true);
    expect(limiter.tryAcquire('b', 0)).toBe(true);
    expect(limiter.tryAcquire('a', 1)).toBe(false);
  });

  it('refused attempts do not extend the lockout', () => {
    const limiter = new SlidingWindowLimiter(1, 1000);

    limiter.tryAcquire('a', 0);
    for (let t = 1; t < 1000; t += 100) limiter.tryAcquire('a', t);

    expect(limiter.tryAcquire('a', 1000)).toBe(true);
  });

  it('stays bounded when attacked with many distinct keys', () => {
    const limiter = new SlidingWindowLimiter(1, 60_000, 50);

    for (let i = 0; i < 500; i += 1) limiter.tryAcquire(`k${i}`, i);

    const size = (limiter as unknown as { hits: Map<string, number[]> }).hits
      .size;
    expect(size).toBeLessThanOrEqual(51);
  });
});

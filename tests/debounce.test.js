
import { describe, it, expect, vi } from 'vitest';
import { debounce } from '../public/js/utils/debounce.js';

describe('debounce', () => {
  vi.useFakeTimers();

  it('should only call the function after the delay has passed', () => {
    const func = vi.fn();
    const debouncedFunc = debounce(func, 500);

    // Call the debounced function multiple times in quick succession
    debouncedFunc();
    debouncedFunc();
    debouncedFunc();

    // The function should not have been called yet
    expect(func).not.toHaveBeenCalled();

    // Advance the timers by the delay amount
    vi.advanceTimersByTime(500);

    // Now the function should have been called exactly once
    expect(func).toHaveBeenCalledTimes(1);
  });
});

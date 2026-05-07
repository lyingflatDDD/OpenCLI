import { describe, expect, it } from 'vitest';
import { CommandExecutionError } from '@jackwener/opencli/errors';
import { getRegistry } from '@jackwener/opencli/registry';
import './unlike.js';
import { createPageMock } from '../test-utils.js';

describe('twitter unlike command', () => {
    it('navigates to the tweet URL and reports success when the unlike script confirms', async () => {
        const cmd = getRegistry().get('twitter/unlike');
        expect(cmd?.func).toBeTypeOf('function');
        const page = createPageMock([
            { ok: true, message: 'Tweet successfully unliked.' },
        ]);
        const result = await cmd.func(page, {
            url: 'https://x.com/alice/status/2040254679301718161',
        });
        expect(page.goto).toHaveBeenCalledWith('https://x.com/alice/status/2040254679301718161');
        expect(page.wait).toHaveBeenNthCalledWith(1, { selector: '[data-testid="primaryColumn"]' });
        // After ok:true the adapter waits an extra 2s for the network round-trip.
        expect(page.wait).toHaveBeenNthCalledWith(2, 2);
        const script = page.evaluate.mock.calls[0][0];
        // Idempotency check: looks for the like button (already-not-liked path) before clicking unlike.
        expect(script).toContain("document.querySelector('[data-testid=\"like\"]')");
        expect(script).toContain("document.querySelector('[data-testid=\"unlike\"]')");
        expect(script).toContain('unlikeBtn.click()');
        expect(result).toEqual([
            { status: 'success', message: 'Tweet successfully unliked.' },
        ]);
    });

    it('returns a failed row without re-waiting when the unlike script reports a UI mismatch', async () => {
        const cmd = getRegistry().get('twitter/unlike');
        expect(cmd?.func).toBeTypeOf('function');
        const page = createPageMock([
            {
                ok: false,
                message: 'Could not find the Unlike button on this tweet after waiting 10 seconds. Are you logged in?',
            },
        ]);
        const result = await cmd.func(page, {
            url: 'https://x.com/alice/status/2040254679301718161',
        });
        expect(result).toEqual([
            {
                status: 'failed',
                message: 'Could not find the Unlike button on this tweet after waiting 10 seconds. Are you logged in?',
            },
        ]);
        // Only the primaryColumn wait should run when ok is false.
        expect(page.wait).toHaveBeenCalledTimes(1);
    });

    it('throws CommandExecutionError when no page is provided', async () => {
        const cmd = getRegistry().get('twitter/unlike');
        await expect(cmd.func(undefined, {
            url: 'https://x.com/alice/status/2040254679301718161',
        })).rejects.toThrow(CommandExecutionError);
    });
});

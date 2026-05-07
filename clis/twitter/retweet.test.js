import { describe, expect, it } from 'vitest';
import { CommandExecutionError } from '@jackwener/opencli/errors';
import { getRegistry } from '@jackwener/opencli/registry';
import './retweet.js';
import { createPageMock } from '../test-utils.js';

describe('twitter retweet command', () => {
    it('clicks the retweet button then the confirm menu item and reports success', async () => {
        const cmd = getRegistry().get('twitter/retweet');
        expect(cmd?.func).toBeTypeOf('function');
        const page = createPageMock([
            { ok: true, message: 'Tweet successfully retweeted.' },
        ]);
        const result = await cmd.func(page, {
            url: 'https://x.com/alice/status/2040254679301718161',
        });
        expect(page.goto).toHaveBeenCalledWith('https://x.com/alice/status/2040254679301718161');
        expect(page.wait).toHaveBeenNthCalledWith(1, { selector: '[data-testid="primaryColumn"]' });
        expect(page.wait).toHaveBeenNthCalledWith(2, 2);
        const script = page.evaluate.mock.calls[0][0];
        // Two-step UI flow must be present:
        //   1) click the retweet button
        //   2) wait for and click the confirm menu item (data-testid="retweetConfirm")
        expect(script).toContain("document.querySelector('[data-testid=\"retweet\"]')");
        expect(script).toContain('retweetBtn.click()');
        expect(script).toContain("document.querySelector('[data-testid=\"retweetConfirm\"]')");
        expect(script).toContain('confirmBtn.click()');
        // Idempotency probe: when already retweeted ([data-testid="unretweet"] present),
        // the script returns ok:true with an "already retweeted" message.
        expect(script).toContain("document.querySelector('[data-testid=\"unretweet\"]')");
        expect(result).toEqual([
            { status: 'success', message: 'Tweet successfully retweeted.' },
        ]);
    });

    it('returns a failed row when the confirm menu item never appears', async () => {
        const cmd = getRegistry().get('twitter/retweet');
        expect(cmd?.func).toBeTypeOf('function');
        const page = createPageMock([
            { ok: false, message: 'Retweet menu opened but the confirm option did not appear.' },
        ]);
        const result = await cmd.func(page, {
            url: 'https://x.com/alice/status/2040254679301718161',
        });
        expect(result).toEqual([
            { status: 'failed', message: 'Retweet menu opened but the confirm option did not appear.' },
        ]);
        expect(page.wait).toHaveBeenCalledTimes(1);
    });

    it('throws CommandExecutionError when no page is provided', async () => {
        const cmd = getRegistry().get('twitter/retweet');
        await expect(cmd.func(undefined, {
            url: 'https://x.com/alice/status/2040254679301718161',
        })).rejects.toThrow(CommandExecutionError);
    });
});

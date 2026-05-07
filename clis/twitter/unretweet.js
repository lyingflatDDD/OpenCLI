import { CommandExecutionError } from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
    site: 'twitter',
    name: 'unretweet',
    access: 'write',
    description: 'Undo a retweet on a specific tweet',
    domain: 'x.com',
    strategy: Strategy.UI,
    browser: true,
    args: [
        { name: 'url', type: 'string', required: true, positional: true, help: 'The URL of the tweet to unretweet' },
    ],
    columns: ['status', 'message'],
    func: async (page, kwargs) => {
        if (!page)
            throw new CommandExecutionError('Browser session required for twitter unretweet');
        await page.goto(kwargs.url);
        await page.wait({ selector: '[data-testid="primaryColumn"]' });
        const result = await page.evaluate(`(async () => {
        try {
            // Poll for the tweet to render
            let attempts = 0;
            let retweetBtn = null;
            let unretweetBtn = null;

            while (attempts < 20) {
                retweetBtn = document.querySelector('[data-testid="retweet"]');
                unretweetBtn = document.querySelector('[data-testid="unretweet"]');

                if (retweetBtn || unretweetBtn) break;

                await new Promise(r => setTimeout(r, 500));
                attempts++;
            }

            // Already not retweeted: idempotent success
            if (retweetBtn) {
                return { ok: true, message: 'Tweet is not retweeted (already removed).' };
            }

            if (!unretweetBtn) {
                return { ok: false, message: 'Could not find the Unretweet button on this tweet after waiting 10 seconds. Are you logged in?' };
            }

            // Step 1: click Unretweet button → opens menu
            unretweetBtn.click();

            // Step 2: wait for the confirm menu item to appear, then click it
            let confirmBtn = null;
            for (let i = 0; i < 20; i++) {
                await new Promise(r => setTimeout(r, 250));
                confirmBtn = document.querySelector('[data-testid="unretweetConfirm"]');
                if (confirmBtn) break;
            }
            if (!confirmBtn) {
                return { ok: false, message: 'Unretweet menu opened but the confirm option did not appear.' };
            }
            confirmBtn.click();
            await new Promise(r => setTimeout(r, 1000));

            // Verify success by checking if the 'retweet' button reappeared
            const verifyBtn = document.querySelector('[data-testid="retweet"]');
            if (verifyBtn) {
                return { ok: true, message: 'Tweet successfully unretweeted.' };
            } else {
                return { ok: false, message: 'Unretweet action was initiated but UI did not update as expected.' };
            }
        } catch (e) {
            return { ok: false, message: e.toString() };
        }
    })()`);
        if (result.ok) {
            // Wait for the unretweet network request to be processed
            await page.wait(2);
        }
        return [{
                status: result.ok ? 'success' : 'failed',
                message: result.message
            }];
    }
});

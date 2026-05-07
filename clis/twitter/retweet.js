import { CommandExecutionError } from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
    site: 'twitter',
    name: 'retweet',
    access: 'write',
    description: 'Retweet a specific tweet',
    domain: 'x.com',
    strategy: Strategy.UI,
    browser: true,
    args: [
        { name: 'url', type: 'string', required: true, positional: true, help: 'The URL of the tweet to retweet' },
    ],
    columns: ['status', 'message'],
    func: async (page, kwargs) => {
        if (!page)
            throw new CommandExecutionError('Browser session required for twitter retweet');
        await page.goto(kwargs.url);
        await page.wait({ selector: '[data-testid="primaryColumn"]' });
        const result = await page.evaluate(`(async () => {
        try {
            // Poll for the tweet to render
            let attempts = 0;
            let retweetBtn = null;
            let unretweetBtn = null;

            while (attempts < 20) {
                unretweetBtn = document.querySelector('[data-testid="unretweet"]');
                retweetBtn = document.querySelector('[data-testid="retweet"]');

                if (unretweetBtn || retweetBtn) break;

                await new Promise(r => setTimeout(r, 500));
                attempts++;
            }

            // Already retweeted: idempotent success
            if (unretweetBtn) {
                return { ok: true, message: 'Tweet is already retweeted.' };
            }

            if (!retweetBtn) {
                return { ok: false, message: 'Could not find the Retweet button on this tweet after waiting 10 seconds. Are you logged in?' };
            }

            // Step 1: click Retweet button → opens menu
            retweetBtn.click();

            // Step 2: wait for the confirm menu item to appear, then click it
            let confirmBtn = null;
            for (let i = 0; i < 20; i++) {
                await new Promise(r => setTimeout(r, 250));
                confirmBtn = document.querySelector('[data-testid="retweetConfirm"]');
                if (confirmBtn) break;
            }
            if (!confirmBtn) {
                return { ok: false, message: 'Retweet menu opened but the confirm option did not appear.' };
            }
            confirmBtn.click();
            await new Promise(r => setTimeout(r, 1000));

            // Verify success by checking if the 'unretweet' button appeared
            const verifyBtn = document.querySelector('[data-testid="unretweet"]');
            if (verifyBtn) {
                return { ok: true, message: 'Tweet successfully retweeted.' };
            } else {
                return { ok: false, message: 'Retweet action was initiated but UI did not update as expected.' };
            }
        } catch (e) {
            return { ok: false, message: e.toString() };
        }
    })()`);
        if (result.ok) {
            // Wait for the retweet network request to be processed
            await page.wait(2);
        }
        return [{
                status: result.ok ? 'success' : 'failed',
                message: result.message
            }];
    }
});

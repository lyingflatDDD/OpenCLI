import { CommandExecutionError } from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';

function extractTweetId(url) {
    let pathname = '';
    try {
        pathname = new URL(url).pathname;
    }
    catch {
        throw new Error(`Invalid tweet URL: ${url}`);
    }
    const match = pathname.match(/\/status\/(\d+)/);
    if (!match?.[1]) {
        throw new Error(`Could not extract tweet ID from URL: ${url}`);
    }
    return match[1];
}

function buildQuoteComposerUrl(url) {
    // Twitter/X quote-tweet compose URL: the `url` param attaches the source
    // tweet as a quoted card. Validating tweet-id shape early surfaces obvious
    // typos before any browser interaction.
    extractTweetId(url);
    return `https://x.com/compose/post?url=${encodeURIComponent(url)}`;
}

async function submitQuote(page, text) {
    return page.evaluate(`(async () => {
        try {
            const visible = (el) => !!el && (el.offsetParent !== null || el.getClientRects().length > 0);
            const boxes = Array.from(document.querySelectorAll('[data-testid="tweetTextarea_0"]'));
            const box = boxes.find(visible) || boxes[0];
            if (!box) {
                return { ok: false, message: 'Could not find the quote composer text area. Are you logged in?' };
            }

            box.focus();
            const textToInsert = ${JSON.stringify(text)};
            // execCommand('insertText') is more reliable with Twitter's Draft.js editor.
            if (!document.execCommand('insertText', false, textToInsert)) {
                // Fallback to paste event if execCommand fails.
                const dataTransfer = new DataTransfer();
                dataTransfer.setData('text/plain', textToInsert);
                box.dispatchEvent(new ClipboardEvent('paste', {
                    clipboardData: dataTransfer,
                    bubbles: true,
                    cancelable: true,
                }));
            }

            await new Promise(r => setTimeout(r, 1000));

            // Confirm the quoted card is rendered before submitting; otherwise we may
            // accidentally post a plain tweet without the quote attachment.
            let cardAttempts = 0;
            let hasQuoteCard = false;
            while (cardAttempts < 20) {
                hasQuoteCard = !!document.querySelector('[data-testid="tweet"], [data-testid="card.wrapper"], [aria-label*="Quote"]')
                    || !!document.querySelector('div[role="link"][tabindex] a[href*="/status/"]');
                if (hasQuoteCard) break;
                await new Promise(r => setTimeout(r, 250));
                cardAttempts++;
            }
            if (!hasQuoteCard) {
                return { ok: false, message: 'Quote target did not render in the composer. The source tweet may be deleted or restricted.' };
            }

            const buttons = Array.from(
                document.querySelectorAll('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]')
            );
            const btn = buttons.find((el) => visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true');
            if (!btn) {
                return { ok: false, message: 'Tweet button is disabled or not found.' };
            }

            btn.click();
            return { ok: true, message: 'Quote tweet posted successfully.' };
        } catch (e) {
            return { ok: false, message: e.toString() };
        }
    })()`);
}

cli({
    site: 'twitter',
    name: 'quote',
    access: 'write',
    description: 'Quote-tweet a specific tweet with your own text',
    domain: 'x.com',
    strategy: Strategy.UI,
    browser: true,
    args: [
        { name: 'url', type: 'string', required: true, positional: true, help: 'The URL of the tweet to quote' },
        { name: 'text', type: 'string', required: true, positional: true, help: 'The text content of your quote' },
    ],
    columns: ['status', 'message', 'text'],
    func: async (page, kwargs) => {
        if (!page)
            throw new CommandExecutionError('Browser session required for twitter quote');

        // Dedicated composer is more reliable than the inline quote-tweet button.
        await page.goto(buildQuoteComposerUrl(kwargs.url), { waitUntil: 'load', settleMs: 2500 });
        await page.wait({ selector: '[data-testid="tweetTextarea_0"]', timeout: 15 });

        const result = await submitQuote(page, kwargs.text);
        if (result.ok) {
            // Wait for network submission to complete
            await page.wait(3);
        }
        return [{
                status: result.ok ? 'success' : 'failed',
                message: result.message,
                text: kwargs.text,
            }];
    }
});

export const __test__ = {
    buildQuoteComposerUrl,
    extractTweetId,
};

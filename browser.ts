import { Page, Browser, chromium } from 'playwright';

export class BrowserController {
    private browser: Browser | null = null;
    public page: Page | null = null;

    async init() {
        this.browser = await chromium.launch({ headless: false }); // See it happen!
        const context = await this.browser.newContext();
        this.page = await context.newPage();
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    async navigate(url: string) {
        if (!this.page) throw new Error("Browser not initialized");
        await this.page.goto(url, { waitUntil: 'networkidle' });
    }

    // This is the secret sauce: Simplify the DOM for the LLM
    async getInteractableElements() {
        if (!this.page) throw new Error("Browser not initialized");
        
        // Inject a script to map out interactable elements and give them an ID
        return await this.page.evaluate(() => {
            let nextId = 1;
            const interactables = document.querySelectorAll('button, a, input, select, textarea, [role="button"]');
            const elementsMap: { id: number; tag: string; text: string; role: string | null; type: string | null }[] = [];

            interactables.forEach((el) => {
                const element = el as HTMLElement;
                // Only care about visible elements
                if (element.offsetWidth > 0 && element.offsetHeight > 0) {
                    const id = nextId++;
                    element.setAttribute('data-agent-id', id.toString());
                    
                    elementsMap.push({
                        id: id,
                        tag: element.tagName.toLowerCase(),
                        text: element.innerText || (element as HTMLInputElement).value || element.getAttribute('aria-label') || 'No text',
                        role: element.getAttribute('role'),
                        type: element.getAttribute('type'),
                    });
                }
            });
            return elementsMap;
        });
    }

    async clickElement(id: number) {
        if (!this.page) throw new Error("Browser not initialized");
        const element = this.page.locator(`[data-agent-id="${id}"]`);
        await element.click();
        await this.page.waitForLoadState('networkidle');
    }

    async typeElement(id: number, text: string) {
        if (!this.page) throw new Error("Browser not initialized");
        const element = this.page.locator(`[data-agent-id="${id}"]`);
        await element.fill(text);
    }
}

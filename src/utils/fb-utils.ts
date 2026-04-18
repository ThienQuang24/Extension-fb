/**
 * Shared Facebook Utilities
 */

export class FBUtils {
    /**
     * Strips Facebook's security prefix from JSON responses
     */
    static cleanJsonResponse(text: string): any {
        try {
            const jsonText = text.replace('for (;;);', '').trim();
            return JSON.parse(jsonText);
        } catch (e) {
            console.error('💥 [FBUtils] JSON Parse Error. Text preview:', text.substring(0, 100));
            throw e;
        }
    }

    /**
     * Generates a random jazoest token for FB requests
     */
    static generateJazoest(): string {
        return '2' + Array.from({ length: 4 }, () => Math.floor(Math.random() * 10)).join('');
    }

    /**
     * Extracts actor tokens and dtsg from the page state
     */
    static async getTokens(actorId?: string): Promise<any> {
        return new Promise((resolve, reject) => {
            try {
                // Try to find fb_dtsg in the window or scripts
                let fb_dtsg = '';
                const scripts = document.querySelectorAll('script');
                for (const script of Array.from(scripts)) {
                    const content = script.textContent || '';
                    const match = content.match(/\["DTSGInitialData",\[\],{"token":"([^"]+)"}/);
                    if (match) {
                        fb_dtsg = match[1];
                        break;
                    }
                }

                if (!fb_dtsg) {
                    // Fallback to searching the whole page for something that looks like dtsg
                    const dtsgMatch = document.documentElement.innerHTML.match(/["']fb_dtsg["']\s*,\s*["']([^"']+)["']/);
                    if (dtsgMatch) fb_dtsg = dtsgMatch[1];
                }

                const currentActorId = actorId || (document.cookie.match(/c_user=(\d+)/)?.[1]);
                
                if (!fb_dtsg || !currentActorId) {
                    reject(new Error('Could not extract Facebook tokens. Are you logged in?'));
                    return;
                }

                resolve({
                    fb_dtsg,
                    actorId: currentActorId
                });
            } catch (e) {
                reject(e);
            }
        });
    }
}

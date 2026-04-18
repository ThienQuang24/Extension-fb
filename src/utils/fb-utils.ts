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

    /**
     * Merges hardcoded variables with a learned template from Facebook's live UI
     */
    static async applyLearnedTemplate(hardcodedDocId: string, hardcodedVariables: any, isGroup: boolean): Promise<{ doc_id: string, variables: any }> {
        try {
            const storageKey = isGroup ? 'fb_api_template_group' : 'fb_api_template_page';
            const data = await chrome.storage.local.get(storageKey);
            const learned = data[storageKey] as { doc_id: string, variables: any, timestamp: number } | undefined;

            if (!learned) return { doc_id: hardcodedDocId, variables: hardcodedVariables };

            console.log(`🧠 [FBUtils] Merging with learned ${isGroup ? 'GROUP' : 'PAGE'} template (${new Date(learned.timestamp).toLocaleTimeString()})`);

            // Use learned doc_id if available
            const finalDocId = learned.doc_id || hardcodedDocId;
            
            // Start with learned variables as base structure
            const finalVariables = JSON.parse(JSON.stringify(learned.variables));

            // Content-critical keys that MUST come from our hardcoded source
            const contentKeys = [
                'idempotence_token', 'source', 'attachments', 'message', 
                'audience', 'actor_id', 'client_mutation_id', 'logging'
            ];

            // Re-apply our dynamic content onto the learned structure
            if (finalVariables.input && hardcodedVariables.input) {
                for (const key of contentKeys) {
                    if (hardcodedVariables.input[key] !== undefined) {
                        finalVariables.input[key] = hardcodedVariables.input[key];
                    }
                }
            }

            // Sync top-level flags from hardcoded if learned is missing them 
            // but usually we want to trust the learned one for everything else
            return { doc_id: finalDocId, variables: finalVariables };
        } catch (e) {
            console.warn('⚠️ [FBUtils] Failed to apply learned template, using hardcoded.', e);
            return { doc_id: hardcodedDocId, variables: hardcodedVariables };
        }
    }
}

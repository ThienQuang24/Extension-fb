/**
 * Facebook GraphQL Payload Sniffer
 * This script runs in the MAIN world to intercept fetch calls.
 */

(function() {
    // Avoid double injection
    if ((window as any).__FB_SNIFFER_ACTIVE) return;
    (window as any).__FB_SNIFFER_ACTIVE = true;

    const originalFetch = window.fetch;

    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        
        try {
            const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
            
            if (url.includes('/api/graphql/')) {
                const body = args[1]?.body;
                if (typeof body === 'string' && body.includes('ComposerStoryCreateMutation')) {
                    // Start observation in background
                    observeResponse(response.clone(), body);
                }
            }
        } catch (e) {
            // Silently fail to not break FB
        }

        return response;
    };

    async function observeResponse(response: Response, requestBody: string) {
        try {
            const text = await response.text();
            // Check if success
            if (text.includes('story_create') || text.includes('post_id')) {
                const params = new URLSearchParams(requestBody);
                const doc_id = params.get('doc_id');
                const variablesRaw = params.get('variables');
                
                if (doc_id && variablesRaw) {
                    const variables = JSON.parse(variablesRaw);
                    const keys = extractKeys(variables);
                    const isGroup = variables.isGroup || requestBody.includes('GROUP');

                    // Send to Extension Isolated World
                    window.postMessage({
                        type: 'FB_LEARNED_TEMPLATE',
                        payload: {
                            doc_id,
                            keys,
                            isGroup,
                            timestamp: Date.now()
                        }
                    }, '*');
                }
            }
        } catch (e) {}
    }

    function extractKeys(obj: any): string[] {
        const keys: string[] = [];
        for (const key in obj) {
            keys.push(key);
            if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                const subKeys = extractKeys(obj[key]);
                subKeys.forEach(sk => keys.push(`${key}.${sk}`));
            }
        }
        return keys;
    }

    console.log('🕵️ Facebook API Sniffer Active (Self-Learning Mode)');
})();

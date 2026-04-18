export const SNIFFER_CODE = `
(function() {
    if (window.__FB_SNIFFER_ACTIVE) return;
    window.__FB_SNIFFER_ACTIVE = true;

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        try {
            const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
            if (url && url.includes('/api/graphql/')) {
                const body = args[1]?.body;
                if (typeof body === 'string' && body.includes('ComposerStoryCreateMutation')) {
                    observeResponse(response.clone(), body);
                }
            }
        } catch (e) {}
        return response;
    };

    async function observeResponse(response, requestBody) {
        try {
            const text = await response.text();
            if (text.includes('story_create') || text.includes('post_id')) {
                const params = new URLSearchParams(requestBody);
                const doc_id = params.get('doc_id');
                const variablesRaw = params.get('variables');
                if (doc_id && variablesRaw) {
                    const variables = JSON.parse(variablesRaw);
                    const isGroup = !!(variables.isGroup || requestBody.includes('GROUP'));
                    window.postMessage({
                        type: 'FB_LEARNED_TEMPLATE',
                        data: { doc_id, variables, isGroup, timestamp: Date.now() }
                    }, '*');
                }
            }
        } catch (e) {}
    }
    console.log('🕵️ Facebook API Sniffer Active');
})();
`;

/**
 * Group Service - Handles Facebook group discovery via GraphQL APIs
 */

export interface GroupSyncResult {
    groups: any[];
    success: boolean;
    error?: string;
}

export class GroupService {
    /**
     * Fetches all groups joined by the current actor (Main or Page)
     */
    static async fetchAllGroups(tokens: any): Promise<GroupSyncResult> {
        try {
            console.log(`🚀 [GroupService] Fetching all joined groups for actor ${tokens.actorId}...`);
            
            const doc_id = "9974006939348139"; // Provided by user
            const groupsMap = new Map<string, any>();
            let cursor = null;
            let hasNextPage = true;
            let pageCount = 0;

            while (hasNextPage && pageCount < 20) { // Safety limit: 20 pages * 50 groups = 1000 groups
                pageCount++;
                const variables = {
                    "count": 50,
                    "cursor": cursor,
                    "ordering": ["integrity_signals"],
                    "scale": 1
                };

                const params = new URLSearchParams();
                params.append('av', tokens.actorId);
                params.append('__user', tokens.actorId);
                params.append('__a', '1');
                params.append('__comet_req', '15');
                params.append('fb_dtsg', tokens.fb_dtsg);
                params.append('fb_api_caller_class', 'RelayModern');
                params.append('fb_api_req_friendly_name', 'GroupsCometAllJoinedGroupsSectionPaginationQuery');
                params.append('variables', JSON.stringify(variables));
                params.append('doc_id', doc_id);

                const response = await fetch('https://www.facebook.com/api/graphql/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: params.toString()
                });

                const text = await response.text();
                const data = this.cleanJsonResponse(text);

                const connection = data.data?.viewer?.all_joined_groups?.tab_groups_list;
                if (!connection) break;

                const edges = connection.edges || [];
                for (const edge of edges) {
                    const node = edge.node;
                    if (node && node.id) {
                        groupsMap.set(node.id, {
                            fbGroupId: node.id,
                            name: node.name,
                            url: node.url || `https://www.facebook.com/groups/${node.id}/`,
                            isManaged: false, // API discovery disabled as requested
                            syncedAt: new Date()
                        });
                    }
                }

                const pageInfo = connection.page_info;
                hasNextPage = pageInfo?.has_next_page || false;
                cursor = pageInfo?.end_cursor || null;
                
                console.log(`📊 [GroupService] Page ${pageCount} synced. Unique so far: ${groupsMap.size}`);
            }

            const allGroups = Array.from(groupsMap.values());
            console.log(`✅ [GroupService] Final unique groups count: ${allGroups.length}`);
            return { success: true, groups: allGroups };
        } catch (e) {
            console.error('❌ [GroupService] Error fetching groups:', e);
            return { success: false, groups: [], error: e instanceof Error ? e.message : 'Unknown' };
        }
    }

    /**
     * Strips Facebook's security prefix from JSON responses
     */
    private static cleanJsonResponse(text: string): any {
        try {
            const jsonText = text.replace('for (;;);', '').trim();
            return JSON.parse(jsonText);
        } catch (e) {
            console.error('💥 [GroupService] JSON Parse Error. Text preview:', text.substring(0, 100));
            throw e;
        }
    }
}

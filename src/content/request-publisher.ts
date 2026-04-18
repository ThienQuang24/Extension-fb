/**
 * Request Publisher - Handles Facebook posting via GraphQL APIs
 */

export interface GraphQLResponse {
    success: boolean;
    publishedUrl?: string;
    error?: string;
}

export class RequestPublisher {
    /**
     * Publishes a post to a Facebook Group via GraphQL
     */
    static async publishGroupGraphQL(config: any, tokens: any): Promise<GraphQLResponse> {
        try {
            console.log('🚀 [RequestPublisher] Starting GraphQL Group Publish...');
            
            // 1. Handle Images if present
            const attachments: any[] = [];
            if (config.post.images && config.post.images.length > 0) {
                console.log(`📸 [RequestPublisher] Uploading ${config.post.images.length} images...`);
                for (const imageUrl of config.post.images) {
                    const fbid = await this.uploadPhoto(imageUrl, tokens);
                    if (fbid) {
                        attachments.push({
                            photo: {
                                id: fbid
                            }
                        });
                    }
                }
            }

            // 2. Extract Group ID
            const groupId = this.extractGroupId(config.fanpageUrl) || config.fbPageId;
            if (!groupId) throw new Error('Could not identify target Group ID');

            const doc_id = "35222657370682144"; // User provided ID
            const client_mutation_id = crypto.randomUUID();

            const variables = {
                "input": {
                    "composer_entry_point": "inline_composer",
                    "composer_source_surface": "group",
                    "idempotence_token": `${client_mutation_id}_GROUP`,
                    "source": "WWW",
                    "attachments": attachments,
                    "message": {
                        "ranges": [],
                        "text": config.post.content || ""
                    },
                    "with_tags_ids": [],
                    "inline_activities": [],
                    "audience": {
                        "to_id": groupId
                    },
                    "actor_id": tokens.actorId,
                    "client_mutation_id": "1",
                    "logging": {
                        "composer_session_id": client_mutation_id
                    }
                },
                "displayCommentsContextEnableComment": true,
                "displayCommentsContextIsOnAndVisible": true,
                "displayCommentsFeedbackContext": null,
                "feedLocation": "GROUP",
                "feedbackSource": 0,
                "isComet": true,
                "isGroup": true,
                "isFeed": false,
                "privacySelectorRenderLocation": "COMET_GROUP",
                "renderLocation": "group",
                "scale": 1,
                "useDefaultActor": false
            };

            const params = new URLSearchParams();
            params.append('av', tokens.actorId);
            params.append('__user', tokens.actorId);
            params.append('fb_dtsg', tokens.fb_dtsg);
            params.append('fb_api_caller_class', 'RelayModern');
            params.append('fb_api_req_friendly_name', 'ComposerStoryCreateMutation');
            params.append('variables', JSON.stringify(variables));
            params.append('doc_id', doc_id);

            const jazoest = '2' + Array.from({ length: 4 }, () => Math.floor(Math.random() * 10)).join('');
            params.append('jazoest', jazoest);

            const response = await fetch('https://www.facebook.com/api/graphql/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: params.toString()
            });

            const text = await response.text();
            console.log('📥 [RequestPublisher] GraphQL Response:', text.substring(0, 500));

            // Parse response
            const lines = text.split('\n').filter(l => l.trim() && l.includes('{'));
            let hasError = false;
            let errorMsg = '';
            
            for (const line of lines) {
                try {
                    const data = JSON.parse(line);
                    if (data.data?.story_create?.story?.url) {
                        return { success: true, publishedUrl: data.data.story_create.story.url };
                    }
                    if (data.errors) {
                        hasError = true;
                        errorMsg = data.errors.map((e: any) => e.message).join('; ');
                    }
                } catch (e) {}
            }

            if (text.includes('story_create') && !hasError) {
                return { success: true };
            }

            return { success: false, error: errorMsg || 'Unknown API failure' };

        } catch (e) {
            console.error('💥 [RequestPublisher] Exception:', e);
            return { success: false, error: e instanceof Error ? e.message : 'Unknown' };
        }
    }

    /**
     * Uploads a photo to Facebook and returns its FBID
     */
    private static async uploadPhoto(url: string, tokens: any): Promise<string | null> {
        try {
            console.log(`📡 [RequestPublisher] Fetching image blob: ${url}`);
            const blob = await (await fetch(url)).blob();
            const filename = url.split('/').pop()?.split('?')[0] || 'photo.jpg';
            const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });

            const formData = new FormData();
            formData.append('fb_dtsg', tokens.fb_dtsg);
            formData.append('__user', tokens.actorId);
            formData.append('av', tokens.actorId);
            formData.append('profile_id', tokens.actorId);
            formData.append('photo', file);
            formData.append('farr', '(binary)');
            formData.append('source', '8'); // 8 = Composer
            formData.append('waterfallxapp', 'comet');
            formData.append('comet', '1');
            
            const jazoest = '2' + Array.from({ length: 4 }, () => Math.floor(Math.random() * 10)).join('');
            formData.append('jazoest', jazoest);

            // Use www.facebook.com instead of upload.facebook.com to ensure cookies are attached
            const uploadUrl = new URL('https://www.facebook.com/ajax/react_composer/attachments/photo/upload');
            uploadUrl.searchParams.append('av', tokens.actorId);
            uploadUrl.searchParams.append('__user', tokens.actorId);
            uploadUrl.searchParams.append('__a', '1');
            uploadUrl.searchParams.append('__comet_req', '15');
            uploadUrl.searchParams.append('fb_dtsg', tokens.fb_dtsg);
            uploadUrl.searchParams.append('jazoest', jazoest);

            console.log(`📡 [RequestPublisher] Sending binary upload to: ${uploadUrl.pathname}`);
            const response = await fetch(uploadUrl.toString(), {
                method: 'POST',
                body: formData
            });

            const text = await response.text();
            console.log('📥 [RequestPublisher] Upload Response Raw (First 100 chars):', text.substring(0, 100));
            
            // SECURITY: Check if it's actually an HTML error page instead of JSON
            if (text.includes('<!DOCTYPE') || text.includes('<html')) {
                console.warn('⚠️ [RequestPublisher] Facebook returned an HTML page. Falling back.');
                return null;
            }

            // Facebook ajax responses often start with for(;;);
            const jsonText = text.replace('for (;;);', '').trim();
            if (!jsonText.startsWith('{')) {
                console.warn('⚠️ [RequestPublisher] Unexpected response format.');
                return null;
            }

            const data = JSON.parse(jsonText);

            // Handle PhotoID from payload (Based on User Logs)
            let fbid = null;
            if (data.payload && data.payload.photoID) {
                fbid = data.payload.photoID;
            } else if (data.payload) {
                fbid = data.payload.fbid || data.payload.photo_id;
            }

            if (fbid) {
                const result = fbid.toString();
                console.log(`✅ [RequestPublisher] Image uploaded successfully. FBID: ${result}`);
                return result;
            }

            console.warn('⚠️ [RequestPublisher] Photo upload did not return an ID. Data:', data);
            return null;
        } catch (e) {
            console.error('❌ [RequestPublisher] Photo upload error:', e);
            return null;
        }
    }

    private static extractGroupId(url: string): string | null {
        try {
            const match = url.match(/\/groups\/(\d+)/);
            return match ? match[1] : null;
        } catch {
            return null;
        }
    }
}

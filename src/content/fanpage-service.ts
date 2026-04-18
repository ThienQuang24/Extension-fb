/**
 * Fanpage Service - Handles Facebook fanpage/profile posting via GraphQL APIs
 */
import { FBUtils } from '@/utils/fb-utils';
import { postPublisher } from './post-publisher';

export interface PostResult {
    success: boolean;
    postId?: string;
    publishedUrl?: string;
    error?: string;
}

export class FanpageService {
    private static isProcessing = false;

    static async publishToPage(actorId: string, content: string, imageUrls: string[] = []): Promise<PostResult> {
        if (this.isProcessing) {
            console.warn('⚠️ [FanpageService] Already processing a post. Signaling background to stay calm.');
            // Return success: true so the background script doesn't trigger fallback
            return { success: true, error: 'In progress' };
        }

        // Failsafe watchdog: Clear processing flag after 2 minutes
        const watchdog = setTimeout(() => {
            if (this.isProcessing) {
                console.warn('🕒 [FanpageService] Watchdog: Resetting stuck processing lock.');
                this.isProcessing = false;
                postPublisher.setGlobalLock(false);
            }
        }, 120000);

        try {
            this.isProcessing = true;
            postPublisher.setGlobalLock(true);
            postPublisher.setStatus('processing');

            // 0. Identity Check & Smart Context Switch
            const currentId = postPublisher.getCurrentProfileId();
            const targetUrl = `https://www.facebook.com/profile.php?id=${actorId}`;

            if (currentId && currentId !== actorId) {
                console.log(`🎭 [FanpageService] Identity mismatch (Current: ${currentId}, Target: ${actorId}). Redirecting for profile switch...`);
                postPublisher.updateDebugOverlay('🎭 Không đúng tư cách Page. Đang chuyển Profile...');
                
                // Store config for resume
                const config = {
                    post: { content, images: imageUrls },
                    fanpageUrl: targetUrl,
                    fbPageId: actorId,
                    publisherId: 'PAGE',
                    targetType: 'FANPAGE'
                };
                localStorage.setItem(postPublisher.PENDING_CONFIG_KEY, JSON.stringify(config));
                
                // Trigger redirect
                window.location.href = targetUrl;
                return { success: false, error: 'REDIRECTING' };
            }

            // AGGRESSIVE CLEANUP: Ensure DOM automation doesn't fire after reload
            // (Only do this when we are ALREADY the correct actor)
            localStorage.removeItem(postPublisher.PENDING_CONFIG_KEY);
            
            postPublisher.showDebugOverlay('🚀 [API] Đang khởi tạo tiến trình đăng bài...');

            console.log(`🚀 [FanpageService] Preparing post for actor: ${actorId}`);
            const tokens = await FBUtils.getTokens(actorId);

            // 1. Upload images if provided
            const attachments: any[] = [];
            if (imageUrls.length > 0) {
                postPublisher.updateDebugOverlay(`📸 Đang tải lên ${imageUrls.length} ảnh qua API...`);
                console.log(`📸 [FanpageService] Uploading ${imageUrls.length} images...`);
                for (let i = 0; i < imageUrls.length; i++) {
                    postPublisher.updateDebugOverlay(`📸 Đang tải ảnh (${i + 1}/${imageUrls.length})...`);
                    const fbid = await this.uploadPhoto(imageUrls[i], tokens);
                    if (fbid) {
                        attachments.push({
                            photo: {
                                id: fbid
                            }
                        });
                    }
                }
            }

            postPublisher.updateDebugOverlay('📡 Đang gửi bài viết lên Facebook...');

            // 2. Build GraphQL Mutation
            const hardcodedDocId = "35222657370682144";
            const sessionId = crypto.randomUUID();

            const hardcodedVariables = {
                "input": {
                    "composer_entry_point": "publisher_bar_media",
                    "composer_source_surface": "timeline",
                    "idempotence_token": `${sessionId}_FEED`,
                    "source": "WWW",
                    "attachments": attachments,
                    "audience": {
                        "privacy": {
                            "allow": [],
                            "base_state": "EVERYONE",
                            "deny": [],
                            "tag_expansion_state": "UNSPECIFIED"
                        }
                    },
                    "message": {
                        "ranges": [],
                        "text": content
                    },
                    "composed_text": {
                        "block_data": ["{}"],
                        "block_depths": [0],
                        "block_types": [0],
                        "blocks": [content],
                        "entities": ["[]"],
                        "entity_map": "{}",
                        "inline_styles": ["[]"]
                    },
                    "with_tags_ids": null,
                    "inline_activities": [],
                    "text_format_preset_id": "0",
                    "publishing_flow": {
                        "supported_flows": ["ASYNC_SILENT", "ASYNC_NOTIF", "FALLBACK"]
                    },
                    "post_publish_story_data": {
                        "reshare_post_as_sticker": "DISABLED"
                    },
                    "logging": {
                        "composer_session_id": sessionId
                    },
                    "actor_id": actorId,
                    "client_mutation_id": "2"
                },
                "feedLocation": "TIMELINE",
                "feedbackSource": 0,
                "scale": 1,
                "renderLocation": "timeline",
                "useDefaultActor": false,
                "isFeed": false,
                "isTimeline": true,
                "isPageNewsFeed": true,
                "privacySelectorRenderLocation": "COMET_STREAM",
                "__relay_internal__pv__CometUFIShareActionMigrationrelayprovider": true,
                "__relay_internal__pv__CometUFI_dedicated_comment_routable_dialog_gkrelayprovider": true,
                "__relay_internal__pv__CometUFISingleLineUFIrelayprovider": true
            };

            // APPLY LEARNED TEMPLATE
            const { doc_id, variables } = await FBUtils.applyLearnedTemplate(hardcodedDocId, hardcodedVariables, false);

            const params = new URLSearchParams();
            params.append('av', tokens.actorId);
            params.append('__user', tokens.actorId);
            params.append('fb_dtsg', tokens.fb_dtsg);
            params.append('fb_api_caller_class', 'RelayModern');
            params.append('fb_api_req_friendly_name', 'ComposerStoryCreateMutation');
            params.append('variables', JSON.stringify(variables));
            params.append('doc_id', doc_id);
            params.append('jazoest', FBUtils.generateJazoest());

            const response = await fetch('https://www.facebook.com/api/graphql/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString()
            });

            const text = await response.text();
            const data = FBUtils.cleanJsonResponse(text);

            if (data.data?.story_create?.post_id) {
                const postId = data.data.story_create.post_id;
                console.log(`✅ [FanpageService] Post created successfully! ID: ${postId}`);
                
                postPublisher.setStatus('success');
                postPublisher.updateDebugOverlay('🎉 Đăng bài thành công! Đang tải lại trang...');

                // Reload page after a short delay to show the new post
                setTimeout(() => {
                    console.log('🔄 [FanpageService] Reloading page to show changes...');
                    window.location.reload();
                }, 3000);

                return { 
                    success: true, 
                    postId: postId,
                    publishedUrl: `https://www.facebook.com/${postId}`
                };
            }

            const error = data.errors?.[0]?.message || 'Failed to create post';
            console.error('❌ [FanpageService] API Error:', error);
            postPublisher.setStatus('failed', error);
            postPublisher.updateDebugOverlay(`❌ Lỗi API: ${error}`);
            
            return { success: false, error };

        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : 'Unknown exception';
            console.error('❌ [FanpageService] Critical Exception:', e);
            postPublisher.setStatus('failed', errorMsg);
            postPublisher.updateDebugOverlay(`❌ Lỗi hệ thống: ${errorMsg}`);
            
            return { success: false, error: errorMsg };
        } finally {
            clearTimeout(watchdog);
            this.isProcessing = false;
            postPublisher.setGlobalLock(false);
            
            // Auto hide overlay after success/fail if no reload happens
            setTimeout(() => {
                postPublisher.removeDebugOverlay();
            }, 5000);
        }
    }

    /**
     * Uploads a photo to Facebook via Ajax upload endpoint
     */
    private static async uploadPhoto(url: string, tokens: any): Promise<string | null> {
        try {
            console.log(`📡 [FanpageService] Fetching image for upload: ${url.substring(0, 50)}...`);
            const blob = await (await fetch(url)).blob();
            const filename = `photo_${Date.now()}.jpg`;
            const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });

            const formData = new FormData();
            formData.append('fb_dtsg', tokens.fb_dtsg);
            formData.append('__user', tokens.actorId);
            formData.append('av', tokens.actorId);
            formData.append('profile_id', tokens.actorId);
            formData.append('photo', file);
            formData.append('source', '8');
            formData.append('waterfallxapp', 'comet');
            formData.append('comet', '1');
            formData.append('jazoest', FBUtils.generateJazoest());

            const uploadUrl = new URL('https://www.facebook.com/ajax/react_composer/attachments/photo/upload');
            uploadUrl.searchParams.append('av', tokens.actorId);
            uploadUrl.searchParams.append('__user', tokens.actorId);
            uploadUrl.searchParams.append('__a', '1');
            uploadUrl.searchParams.append('fb_dtsg', tokens.fb_dtsg);

            const response = await fetch(uploadUrl.toString(), {
                method: 'POST',
                body: formData
            });

            const text = await response.text();
            const data = FBUtils.cleanJsonResponse(text);

            const fbid = data.payload?.photoID || data.payload?.fbid;
            if (fbid) {
                console.log(`✅ [FanpageService] Image uploaded. FBID: ${fbid}`);
                return fbid.toString();
            }

            return null;
        } catch (e) {
            console.error('❌ [FanpageService] Image upload failed:', e);
            return null;
        }
    }
}

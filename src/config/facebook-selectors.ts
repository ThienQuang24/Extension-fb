export const FACEBOOK_SELECTORS = {
    // Login & Auth
    LOGIN_INDICATORS: [
        'div[role="navigation"]',
        'div[aria-label="Account"]',
        'div[aria-label="Tài khoản"]',
        'input[type="search"]'
    ],

    // Fanpage Detection
    FANPAGE: {
        ADS_LINK: 'a[href*="page_id="]',
        NAME: 'a[role="link"] span',
        AVATAR_SVG: 'image[href*="scontent"]',
        AVATAR_IMG: 'img[src*="scontent"]',
        PROFILE_LINK_PATTERN: 'a[href*="profile.php?id="]'
    },

    // Search & Posts
    POST_CONTAINER_ROLE: 'article',
    POST_CONTAINER_CLASS: 'div.x1yztbdb.x1n2onr6.xh8yej3.x1ja2u2z',
    POST_FEED_ROLE: 'feed',
    // Broad selectors for search results where 'article' might be missing
    POST_SEARCH_RESULT_SELECTOR: 'div.x1yztbdb, div[role="feed"] > div, article',
    POST_ACTION_MENU_LABEL: ['Hành động với bài viết này', 'Actions for this post'],

    // Post Content Extraction
    POST_CONTENT: 'div[data-ad-comet-preview="message"], div[data-ad-preview="message"], div[dir="auto"]',
    POST_TEXT_LEGACY: 'div[data-ad-preview="message"]',
    POST_AUTHOR_LINK: 'h2 a[role="link"], h3 a[role="link"], a[role="link"][tabindex="0"]',
    POST_IMAGES: 'img', // Select all images, then filter
    POST_VIDEO: 'video',
    POST_LINK_PATTERNS: [
        /\/posts\/(\d+)/,
        /\/permalink\/(\d+)/,
        /\/videos\/(\d+)/,
        /[?&]fbid=(\d+)/,
        /[?&]story_fbid=(\d+)/,
        /[?&]multi_permalinks=(\d+)/
    ],

    // Scraper Utils
    END_MARKERS: [
        'Kết quả tìm kiếm chỉ bao gồm những nội dung hiển thị với bạn',
        'Search results only include things visible to you',
        'End of Results',
        'Đã hết kết quả',
        "We didn't find any results",
        'Chúng tôi không tìm thấy kết quả nào'
    ],

    // Create Post (Publishing)
    CREATE_POST_BUTTONS: [
        'div[role="button"][aria-label*="Create"]',
        'div[role="button"][aria-label*="What"]',
        'div[role="button"][aria-label*="Tạo"]', // VN
        'div[role="button"][aria-label*="nghĩ"]', // VN
        'div[contenteditable="true"]',
        'div.notranslate'
    ],
    CREATE_POST_TEXT_TRIGGERS: [
        'tạo bài viết',
        'bạn đang nghĩ gì',
        "what's on your mind",
        'create post'
    ],

    // Post Modal
    POST_MODAL_INPUT: [
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"][aria-label*="post"]',
        'div[contenteditable="true"][aria-label*="bài viết"]',
        'div[contenteditable="true"].notranslate'
    ],

    // Actions
    POST_SUBMIT_BUTTON: {
        ROLES: ['button'],
        LABELS: ['post', 'đăng', 'tiếp'],
    },

    // File Upload
    FILE_INPUT: 'input[type="file"]',
    ADD_PHOTO_BUTTON: [
        'div[aria-label*="Photo"]', // These are used as trigger strings now
        'div[aria-label*="Video"]',
        'div[aria-label*="Ảnh"]'
    ],

    // Reels Specific
    REELS: {
        TITLE_INPUT: 'input[placeholder="Tiêu đề thước phim"], input[placeholder="Describe your reel..."]',
        NEXT_BUTTON: 'div[role="button"]:has(span:nth-child(1))', // Broad, will use text matching in code
        PUBLISH_BUTTON: 'div[role="button"]:has(span:nth-child(1))', // Broad, will use text matching in code
    }
}

export const FB_URLS = {
    HOME: 'https://www.facebook.com',
    FANPAGES: 'https://www.facebook.com/pages/?category=your_pages',
    SEARCH: (keyword: string) => `https://www.facebook.com/search/posts?q=${encodeURIComponent(keyword)}&filters=${encodeURIComponent('eyJzb3J0X2tleSI6InNvcnRfbW9zdF9yZWNlbnQifQ==')}` // Most recent
}

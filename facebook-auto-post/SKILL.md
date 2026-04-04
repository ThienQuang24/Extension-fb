---
name: Facebook Auto Post
description: Tự động đăng bài (ảnh + caption, kèm lịch đăng) lên Facebook Page bằng Facebook Private API (không phải Official API). Ưu tiên API cho ảnh; fallback DOM cho video.
---

# Facebook Auto Post Skill

> ✅ **STATUS: VERIFIED — Multi-page | API ảnh (đăng ngay + lên lịch) | DOM video**  
> Tested: 14/03/2026 — Ái Linh Store + Điện Máy Vĩnh Tín

---

## Khi nào dùng skill này
- Đăng ảnh (1 hoặc nhiều) lên bất kỳ Facebook Page nào
- Lên lịch đăng ảnh tự động theo giờ
- Đăng video/Reels lên Facebook Page (DOM fallback)

---

## ⚡ QUAN TRỌNG: Cách đổi Page trước khi chạy

Script tự động dùng **bất kỳ Facebook Page nào đang mở trong Chrome**. Không cần config gì.

```
1. Mở Chrome → navigate đến page muốn đăng (vd: facebook.com/vinhtin.store)
2. Chạy fb_api_post.py → script đọc URL hiện tại, tự dùng page đó
```

> ✅ Hoạt động với: Ái Linh Store, Điện Máy Vĩnh Tín, hoặc bất kỳ Page nào.  
> ❌ Không hardcode page ID hay URL nào.

---

## 🥇 PHƯƠNG THỨC 1: Facebook Private API — Đăng ẢNH

> Không cần click/DOM — toàn bộ upload + post qua XHR trong browser context.

### Script
```
d:\Extention Hand\hand-extension\sdk\fb_api_post.py
```

### Cách chạy

```bash
# Đăng ngay
python sdk/fb_api_post.py "img1.png" "img2.png" -c "Caption"

# Lên lịch (ISO 8601)
python sdk/fb_api_post.py "img1.png" "img2.png" -c "Caption" -s "2026-03-18T09:35"

# Caption từ file .txt (PHẢI dùng trong PowerShell — không truyền multi-line inline)
python sdk/fb_api_post.py "img1.png" -c "C:/path/caption.txt" -s "2026-03-20T10:30"
```

### Tham số

| Flag | Bắt buộc | Mô tả |
|------|----------|-------|
| `images` (positional) | ✅ | Đường dẫn 1+ file ảnh (JPG, PNG) |
| `-c CAPTION` | ✅ | Caption text hoặc đường dẫn file .txt |
| `-s SCHEDULE` | ❌ | ISO datetime: `YYYY-MM-DDTHH:MM` |

### Kiểm tra bài đã lên lịch
```
https://www.facebook.com/professional_dashboard/content/content_library/?filter=SCHEDULED
```

---

## Kiến trúc kỹ thuật — Cơ chế Dynamic Multi-Page

### Cách script tự detect Page đang active

```
Bước 1: Đọc URL hiện tại từ Chrome (hand_execute_js / get_eyes)
Bước 2: Navigate lại về CHÍNH URL đó để lấy token mới
Bước 3: Extract actor_id bằng 6 strategies (xem bên dưới)
Bước 4: Dùng actor_id đó cho toàn bộ upload + post
```

### 6 Strategies tìm Page actor ID (thứ tự ưu tiên)

| # | Pattern | Ghi chú |
|---|---------|---------|
| S1 | `"pageID":"<id>"` trong scripts | Phổ biến nhất với page có pageID riêng |
| S2 | `"page_id":"<id>"` trong scripts | Alternate key |
| S3 | `"profileID":"<id>"` ≠ user_id | profileID khác user_id = page actor |
| S4 | `meta[property="al:android:url"]` / `og:url` | Chứa numeric Page ID |
| S5 | `window.__RELAY_ENV__` global | FB React Relay context |
| S6 | `profile.php?id=<id>` trong URL | Personal page fallback |
| Fallback | `actorID` / `userID` từ scripts | Trên một số page, actorID đã là Page ID |

> **Lưu ý**: Trên Điện Máy Vĩnh Tín (`vinhtin.store`), `actorID = pageID = 100064171563699` — chỉ có 1 ID duy nhất, không cần tách. Code fallback về `user_id` là đúng.

### Flow API (3 bước)

```
1. Refresh page hiện tại → lấy dtsg token tươi
2. Upload từng ảnh → nhận photoID (upload.facebook.com)
3. ComposerStoryCreateMutation → tạo post (ngay hoặc scheduled)
```

### Upload ảnh

**Endpoint:** `https://upload.facebook.com/ajax/react_composer/attachments/photo/upload`

| Param | Giá trị |
|-------|---------|
| `source` | `8` (không phải 19) |
| `farr` | `<blob>` (không phải `file`) |
| `profile_id` | `actor_id` (Page actor, không phải admin) |
| `waterfallxapp` | `comet` |
| `av`, `__user` | `actor_id` (trong URL query) |

### GraphQL Mutation

| Param | Giá trị |
|-------|---------|
| `doc_id` | `26440597318868884` |
| `fb_api_req_friendly_name` | `ComposerStoryCreateMutation` |
| `actor_id` trong input | Page actor ID |
| `av`, `__user` trong params | Page actor ID |

---

## 🔑 Root Cause Scheduling Fix (VERIFIED)

**Vấn đề:** Post có `unpublished_content_data` nhưng vẫn publish ngay.

**Nguyên nhân:** `av` / `__user` / `actor_id` phải là **Page actor ID**, không phải admin user ID.

**Fix:**
1. JS tự tìm `page_id` (6 strategies) → dùng làm `actor_id`
2. Dùng `actor_id` cho `av`, `__user`, `variables.input.actor_id`
3. **Bỏ** field `publishing_flow` khỏi input

**Input khi lên lịch:**
```json
"unpublished_content_data": {
  "scheduled_publish_time": 1773801300,
  "unpublished_content_type": "SCHEDULED"
}
```

**Response scheduled thành công:** `post_id=null`, `flow=FALLBACK`

---

## Lỗi thường gặp

| Lỗi | Nguyên nhân | Fix |
|-----|-------------|-----|
| `1357004` | Token stale | Extract dtsg trong JS, không qua Python f-string |
| `1357032` | `profile_id` / `av` sai page | Đảm bảo Chrome đang ở đúng Page trước khi chạy |
| `1366046` | Ảnh quá nhỏ | Dùng ảnh > 100KB |
| Post publish ngay (không lên lịch) | `actor_id` sai hoặc có `publishing_flow` | Xem Root Cause section |
| PowerShell parse lỗi | Caption nhiều dòng inline | Lưu caption vào file .txt |

---

## 🥈 PHƯƠNG THỨC 2: DOM — Đăng VIDEO (Fallback)

> Dùng khi: đăng video/Reels — API chưa hỗ trợ video upload.  
> DOM cũng tự động dùng page đang active trong Chrome.

### Script
```
d:\Extention Hand\hand-extension\sdk\fb_auto_post.py
```

### Cách chạy
```bash
python sdk/fb_auto_post.py <video.mp4> -P <PAGE_ID> -c "Caption" -t "Tiêu đề"
python sdk/fb_auto_post.py video.mp4 -P current -c "Caption" -t "Tiêu đề" -s "2026-03-20T10:30"
```

### Flow DOM (12 bước — VERIFIED ✅)
```
1.  Navigate → page URL
2.  Click "Bạn đang nghĩ gì?" → mở Composer
3.  Type caption → [contenteditable][role="textbox"]
4.  Upload video → DataTransfer inject vào input[type="file"]
5.  Poll → đợi nút "Tiếp"
6.  Click "Tiếp" (1) → Reels Editor
7.  Type reel title → input[placeholder="Tiêu đề thước phim"]
8.  Click "Tiếp" (2) → Publish screen
9.  Click "Đăng"
10. Nếu có lịch: "Lựa chọn lịch đăng" → calendar → Lưu → "Lên lịch đăng sau"
11. Dismiss popups (WhatsApp, Reels suggestion)
12. Verify dialog đóng
```

### Nguyên tắc DOM
- ❌ KHÔNG dùng class CSS (Atomic CSS thay đổi theo build)
- ✅ Dùng: text content, aria-label, role, placeholder
- ✅ Scope vào dialog: `document.querySelectorAll('[role="dialog"]')[0]`
- ✅ Upload: inject DataTransfer (KHÔNG click icon)
- ✅ Typing: `hand_execute_action type`

---

## Yêu cầu chung
- **Hand Extension** đang chạy (bridge + Chrome extension)
- **Chrome** mở đúng Facebook Page cần đăng (đã đăng nhập)
- Python: `websockets`, `json`, `base64`

## Files
| File | Mô tả |
|------|-------|
| `sdk/fb_api_post.py` | ⭐ Đăng ảnh pure API — multi-page dynamic |
| `sdk/fb_auto_post.py` | Đăng video DOM (v3) |
| `sdk/captures/` | Network captures dùng để phân tích API |

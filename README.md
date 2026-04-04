# Facebook Auto Manager - Chrome Extension v2

Extension Chrome tự động quản lý Facebook: tìm kiếm, crawl bài viết và đăng lên fanpage.

## ✨ Tính năng chính

### 1. 🔍 Tìm kiếm & Crawl Nâng Cao (v2)
- **Tìm kiếm Ma trận (Matrix Search):** Quét kết hợp Từ khóa × Danh sách Group.
- **Quét Group:** Tự động đi qua danh sách Group và thu thập bài viết.
- **Auto "Xem thêm":** Tự động mở rộng nội dung bài dài.
- **Smart Scroll:** Infinite scrolling không giới hạn.
- **An toàn:** Tự động đóng popup lỗi/modal để tránh gián đoạn.

### 2. 🛡️ Bộ lọc Thông minh
- **Negative Keywords:** Chặn bài viết chứa từ khóa loại trừ (ví dụ: tin spam tìm việc).
- **Required Keywords:** Bắt buộc bài viết phải chứa từ khóa khi quét Group.
- **Bộ lọc nội dung:** Lọc theo độ dài, có ảnh/video.

### 3. 📄 Quản lý Fanpage & Đăng bài
- Tự động detect các fanpage bạn quản lý.
- Đăng bài ngay hoặc Lên lịch tự động.
- Polling mechanism gúp đăng bài ổn định không timeout.
- Cấu hình giới hạn bài đăng/ngày, khung giờ hoạt động.

### 4. 🏷️ Quản lý Từ khóa
- Lưu lại lịch sử input Ma trận.
- Nhóm từ khóa theo danh mục.

## 🛠️ Công nghệ sử dụng

- **Vue 3** + **TypeScript** - Frontend framework
- **Vite** - Build tool
- **Pinia** - State management
- **Vue Router** - Routing
- **Dexie** - IndexedDB wrapper
- **Manifest v3** - Chrome extension standard

## 📦 Cài đặt

### Development

```bash
npm install
npm run dev
```

### Build extension

```bash
npm run build
```

### Load vào Chrome

1. Vào `chrome://extensions/`
2. Bật "Developer mode"
3. Click "Load unpacked"
4. Chọn thư mục `dist/`

## ⚠️ Lưu ý

- Extension này chỉ để học tập
- Tự động crawl có thể vi phạm ToS của Facebook
- Sử dụng có trách nhiệm!

## 📄 License

MIT License

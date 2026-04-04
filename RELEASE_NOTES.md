# Facebook Auto Manager v2.0.0 - Release Notes

## 🚀 New Features (Tính năng mới)

### 1. Matrix Search (Tìm kiếm Ma trận)
- Cho phép quét kết hợp nhiều **Từ khóa** với nhiều **Group**.
- Hỗ trợ chế độ quét song song (vừa tìm trong Group, vừa tìm trên Facebook Search).
- Tự động lưu lại lịch sử nhập liệu.

### 2. Group Scanning (Quét Group)
- Tự động điều hướng qua danh sách Group.
- Hỗ trợ cuộn vô tận (Infinite Scroll) để lấy tối đa bài viết.
- Cơ chế "Wiggle" giúp scraper không bị kẹt khi Facebook load chậm.

### 3. Smart Filtering (Bộ lọc Thông minh)
- **Negative Keywords (Từ khóa loại trừ):** Chặn các bài viết chứa từ khóa không mong muốn (ví dụ: "cần tìm việc", "spam").
- **Required Keywords (Từ khóa bắt buộc):** Chỉ lấy bài viết chứa từ khóa mục tiêu khi quét Group.
- **Auto-Close Modal:** Tự động phát hiện và đóng các popup/modal không mong muốn để duy trì tiến trình quét.

### 4. Content Intelligence
- **Smart "See more":** Tự động click "Xem thêm" để lấy toàn bộ nội dung mà không gây gián đoạn.
- **Comment Filtering:** Tự động loại bỏ các comment rác, chỉ giữ lại bài viết gốc.

## 🐛 Bug Fixes (Sửa lỗi)
- **Fixed:** Nút "Stop" (Dừng lại) giờ hiển thị đúng trạng thái ngay cả khi tắt extension.
- **Fixed:** Lỗi chuyển hướng sai trang khi đang quét Group.
- **Fixed:** lỗi timeout "Attempting to use a disconnected port" khi đăng bài (đã chuyển sang cơ chế Polling).
- **Fixed:** Lỗi lấy nhầm nội dung comment vào danh sách bài viết.

## 🛠 Technical Improvements
- Nâng cấp timeout từ 30s -> 90s cho các tác vụ nặng.
- Tối ưu hóa bộ nhớ khi crawl số lượng lớn.
- Cải thiện giao diện Dashboard và Search Manager.

---
**Phiên bản:** 2.0.0
**Ngày phát hành:** 07/01/2026

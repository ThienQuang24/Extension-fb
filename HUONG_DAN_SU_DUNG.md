# HƯỚNG DẪN SỬ DỤNG FACEBOOK AUTO MANAGER (CHROME EXTENSION)

Chào mừng bạn đến với **Facebook Auto Manager v2**. Đây là công cụ đắc lực giúp bạn tự động hóa việc tìm kiếm, thu thập bài viết (crawl) từ các hội nhóm, từ khóa trên Facebook và hỗ trợ tự động đăng lại lên Fanpage hoặc Nhóm của bạn một cách nhanh chóng và tiện lợi bằng công nghệ API.

---

## I. HƯỚNG DẪN CÀI ĐẶT

### Bước 1: Build source code (Nếu chưa có sẵn thư mục dist)
Nếu bạn chỉ nhận được mã nguồn (source code) và chưa có sẵn thư mục `dist/`, bạn cần chạy các lệnh sau trong terminal:
```bash
npm install
npm run build
```

### Bước 2: Cài đặt vào Google Chrome
1. Mở trình duyệt Google Chrome, truy cập: `chrome://extensions/`.
2. Bật **"Developer mode"** (Chế độ cho nhà phát triển).
3. Nhấn **"Load unpacked"** (Tải tiện ích đã giải nén) và chọn thư mục `dist/` của dự án.
4. Ghim icon Extension lên thanh công cụ để sử dụng.

---

## II. HƯỚNG DẪN CHI TIẾT CÁC TÍNH NĂNG

### 1. Tìm kiếm và Crawl dữ liệu bài viết
Tính năng này giúp bạn thu thập nội dung từ các nguồn khác nhau trên Facebook để làm kho tư liệu.

*   **Truy cập Menu**: Vào mục **Tìm kiếm & Crawl**.
*   **Chế độ quét**:
    *   **Tìm từ khóa**: Quét bài viết theo từ khóa trên toàn Facebook.
    *   **Quét Group**: Dán danh sách Link các Group để thu thập bài viết mới nhất.
    *   **Tìm kiếm Ma trận (Nâng cao)**: Kết hợp danh sách Từ khóa + danh sách Group (Hiệu suất cực cao).
*   **Thiết lập**: Nhập số bài tối đa và nhấn **Bắt đầu**. Hệ thống sẽ tự động thu nạp Ảnh/Nội dung vào kho quản lý.

### 2. Quản lý và Đăng bài lên Fanpage (Công nghệ API-First)
Hệ thống ưu tiên sử dụng API GraphQL để đăng bài với tốc độ cao và cực kỳ ổn định.

*   **Tự động chuyển Profile (Smart Context Switch)**: 
    - Nếu bạn đang ở Facebook cá nhân nhưng chọn đăng vào Fanpage, Extension sẽ tự động hiện thông báo *"🎭 Đang chuyển Profile"*.
    - Nó sẽ tự động nhấn nút **Chuyển ngay** trên Facebook và tiếp tục quy trình đăng ngay sau khi chuyển vùng thành công.
*   **Đăng bài**: Chỉ cần chọn bài từ kho và nhấn **Đăng ngay**. Hệ thống sẽ xử lý nạp ảnh và đăng nội dung hoàn toàn tự động.

### 3. Đăng bài vào Nhóm (Groups)
*   Hỗ trợ đăng bài vào các Nhóm bạn tham gia hoặc quản lý thông qua API.
*   Trường hợp API bị hạn chế bởi chính sách của Nhóm, hệ thống sẽ tự động chuyển sang **Chế độ Dự phòng (DOM)** để soạn thảo trực tiếp trên trình duyệt, đảm bảo 100% bài viết được gửi đi thành công.

### 4. Lên lịch đăng bài tự động (Scheduling)
*   Tại mỗi bài viết trong kho dữ liệu, nhấn nút **Lên lịch (⏰)**.
*   Chọn thời gian và mục tiêu đăng. Extension sẽ tự động thực thi mọi bước khi đến giờ mà bạn không cần can thiệp thủ công.

---

## III. MỘT SỐ LƯU Ý QUAN TRỌNG

> [!IMPORTANT]
> **Khung trạng thái Overlay**: Khi đang chạy tác vụ, bạn sẽ thấy một khung nhỏ ở góc dưới bên trái màn hình báo cáo trạng thái (Đang tải ảnh, Đang đăng bài...). Đừng đóng khung này để đảm bảo tác vụ không bị ngắt quãng.

> [!TIP]
> **Xử lý Identity**: Nếu bài đăng không hiển thị hoặc thiếu ảnh, hãy nhấn vào tên Fanpage/Group đó một lần trên trình duyệt để Extension cập nhật lại quyền Quản trị (Token).

---
*Chúc bạn có những trải nghiệm tuyệt vời cùng Facebook Auto Manager!*

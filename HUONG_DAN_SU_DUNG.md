# HƯỚNG DẪN SỬ DỤNG FACEBOOK AUTO MANAGER (CHROME EXTENSION)

Chào mừng bạn đến với **Facebook Auto Manager v2**. Đây là công cụ đắc lực giúp bạn tự động hóa việc tìm kiếm, thu thập bài viết (crawl) từ các hội nhóm, từ khóa trên Facebook và hỗ trợ tự động đăng lại lên Fanpage của bạn một cách nhanh chóng và tiện lợi.

Dưới đây là hướng dẫn chi tiết cách cài đặt và sử dụng ứng dụng.

---

## I. HƯỚNG DẪN CÀI ĐẶT

Do đây là một Extension tự phát triển, bạn cần cài đặt thông qua chế độ dành cho Nhà phát triển (Developer Mode) của Chrome.

### Bước 1: Build source code (Nếu chưa có sẵn thư mục dist)
Nếu bạn chỉ nhận được mã nguồn (source code) và chưa có sẵn thư mục `dist/`, bạn cần chạy các lệnh sau trong terminal/cmd tại thư mục chứa source code:
```bash
npm install
npm run build
```
Sau khi chạy xong, một thư mục `dist/` sẽ được tạo ra.

### Bước 2: Cài đặt vào Google Chrome
1. Mở trình duyệt Google Chrome.
2. Tại thanh địa chỉ, nhập: `chrome://extensions/` và nhấn Enter.
3. Ở góc trên cùng bên phải, bật chế độ **"Developer mode"** (Chế độ cho nhà phát triển).
4. Nhấn vào nút **"Load unpacked"** (Tải tiện ích đã giải nén) ở góc trên cùng bên trái.
5. Tìm đến thư mục dự án của extension, và chọn thư mục `dist/`.
6. Sau khi tải thành công, bạn sẽ thấy icon của **Facebook Auto Manager** xuất hiện trên thanh công cụ của Chrome. Bạn có thể ghim icon này (pin) để tiện sử dụng.

---

## II. HƯỚNG DẪN SỬ DỤNG CÁC TÍNH NĂNG CHÍNH

### 1. Tính năng Tìm kiếm & Quét bài viết (Crawl Nâng Cao)
Tiện ích hỗ trợ hai phương thức tìm kiếm chính:

*   **Tìm kiếm Từ khóa ma trận (Matrix Search):** 
    *   **Cách hoạt động:** Cho phép bạn quét kết hợp giữa nhiều "Từ khóa" và nhiều "Nhóm" (Group) khác nhau. 
    *   **Ví dụ:** Bạn có danh sách 3 nhóm chợ sinh viên, và tổ hợp 5 từ khóa (nhà trọ, điện thoại cũ, tìm việc...). Bằng cách thiết lập ma trận, tool sẽ tự động rảo qua từng nhóm và tìm các bài viết phù hợp.

*   **Quét Group (Nhóm):**
    *   **Công dụng:** Tự động lướt và thu thập tất cả bài viết mới trong những Group được chỉ định.
    *   **Cách dùng:** Nhập link trực tiếp/ID của các hội nhóm bạn cần theo dõi, khởi chạy quét, thư giãn và chờ tool lọc bài cho bạn.
    *   Tính năng *Smart Scroll* (cuộn thông minh) kết hợp *Auto "Xem thêm"* sẽ đảm bảo nội dung bài dài được thu thập đầy đủ mà không bị ngắt quãng. Những popup phiền phức của Facebook cũng sẽ được hệ thống đóng tự động.

### 2. Sử dụng Bộ lọc Thông minh (Smart Filters)
Để tránh thu thập những bài viết rác, bài đăng không đúng mục đích, hãy thiết lập bộ lọc:

*   **Từ khóa loại trừ (Negative Keywords):** Nếu bài viết chứa những từ này (VD: "Đa cấp", "Lừa đảo", "Spam làm việc tại nhà..."), bài viết sẽ bị tự động loại bỏ.
*   **Bắt buộc chứa từ khóa (Required Keywords):** Trái ngược với từ trừ, bạn có thể thiết lập chỉ lưu lại bài khi nó có gắn các từ (VD: "Chính chủ", "Thanh lý").
*   **Lọc theo nội dung đa phương tiện:** Bạn có thể chọn chỉ lấy bài viết có Hình ảnh / Video, loại bỏ các bài chỉ có text thông thường, hay lọc theo số lượng từ ngữ trong bài viết.

### 3. Đăng bài lên Fanpage (Auto Post)
Sau khi có được nguồn bài viết dồi dào, bạn có thể chuyển chúng sang Fanpage của mình nhanh chóng:

1.  **Cấu hình Fanpage:** Công cụ tự động quét và nhận diện các Fanpage hiện có mà bạn đang nắm quyền quản trị.
2.  **Đăng ngay hoặc Lên lịch (Schedule):**
    *   *Đăng ngay:* Bài viết cùng đầy đủ nội dung, hình ảnh sẽ được đăng trực tiếp lên Fanpage. Tool hỗ trợ copy paste thông minh bằng Lexical editor, bypass các giới hạn chống spam của Faceboook.
    *   *Lên lịch:* Bạn có thể tích trữ bài và thiết lập để tool tự rải bài ra đăng.
3.  **Giới hạn an toàn:** Nhằm bảo vệ page, bạn có thể chỉnh được số lượng bài tối đa trong 1 ngày, hoặc khoảng giờ tool được phép hoạt động.

### 4. Quản lý Từ khóa
Nếu bạn thường xuyên phải làm việc với các ngách nội dung (Niche) khác nhau, tiện ích cho phép:
*   Phân loại và gom nhóm những Từ khóa thành từng Danh mục riêng.
*   Tra cứu, lưu lịch sử bộ từ khóa đã sử dụng.

---

## III. MỘT SỐ LƯU Ý QUAN TRỌNG KHI SỬ DỤNG
*   **⚠ LƯU Ý VỀ TÀI KHOẢN:** Sử dụng tool auto crawler có một tỷ lệ rủi ro có thể khiến tài khoản Facebook của bạn bịcheckpoint (yêu cầu xác minh) hoặc cảnh báo do vi phạm Chính sách của Facebook (ToS).
*   Hãy **Sử dụng mật độ vừa phải**, ví dụ hạn chế việc quét liên tục 24/24. 
*   Chia nhỏ thời gian giữa những đợt Post bài, hạn chế setting Post quá nhiều bài (hàng chục bài) vào cùng 1 trang trong thời gian ngắn ngủn.
*   Ứng dụng hoạt động thông qua việc bật Facebook Web (chạy song song thao tác trên tab), nên vui lòng không đóng quá trình tab đang thực hiện trong lúc tool đang chạy.

---
*Chúc bạn có những trải nghiệm tuyệt vời cùng Facebook Auto Manager!*

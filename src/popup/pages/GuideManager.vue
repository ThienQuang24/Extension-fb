<template>
  <div class="guide-manager">
    <h1>Hướng dẫn sử dụng</h1>

    <div class="guide-content">
      <section class="guide-section">
        <h2>🚀 Bắt đầu nhanh</h2>
        <p>Facebook Auto Manager giúp bạn tự động hóa việc tìm kiếm và đăng bài lên Fanpage. Để công cụ hoạt động tốt nhất:</p>
        <ul>
          <li><strong>Giữ tab Facebook mở:</strong> Extension cần một tab Facebook đang đăng nhập để lấy quyền truy cập (Token).</li>
          <li><strong>Không tắt trình duyệt:</strong> Khi đang chạy tác vụ (tìm kiếm, đăng bài), đừng tắt trình duyệt.</li>
          <li><strong>Kiểm tra Fanpage:</strong> Đảm bảo bạn đã chọn đúng Fanpage (Switch Profile) trên tab Facebook nếu gặp lỗi quyền.</li>
        </ul>
      </section>

      <section class="guide-section">
        <h2>🔍 1. Tìm kiếm nội dung (Scraper)</h2>
        <p>Tính năng giúp bạn tìm bài viết từ các Fanpage/Group khác với 2 chế độ:</p>
        
        <h3>📌 Chế độ 1: Tìm từ khóa</h3>
        <ol>
          <li>Vào tab <strong>Tìm kiếm</strong>, chọn <strong>"Tìm từ khóa"</strong>.</li>
          <li>Nhập từ khóa (ví dụ: "review phim", "bất động sản").</li>
          <li>Chọn số lượng bài tối đa muốn lấy.</li>
          <li>Bấm <strong>Bắt đầu quét</strong>. Công cụ sẽ tự động cuộn và thu thập bài viết.</li>
        </ol>

        <h3>🎯 Chế độ 2: Quét Group (MỚI)</h3>
        <ol>
          <li>Chọn <strong>"Quét Group"</strong> trong tab Tìm kiếm.</li>
          <li>Nhập URL của các Group (mỗi dòng một link), ví dụ:
            <pre style="background: #f6f8fa; padding: 8px; border-radius: 4px; font-size: 12px;">https://www.facebook.com/groups/123456789
https://www.facebook.com/groups/example-group</pre>
          </li>
          <li>Bấm <strong>Bắt đầu quét Group</strong>.</li>
          <li>Tool sẽ tự động:
            <ul>
              <li>✅ Chuyển từng Group một theo thứ tự</li>
              <li>✅ Cuộn vô tận cho đến khi bạn bấm <strong>Dừng lại (Stop)</strong></li>
              <li>✅ Tự động bấm "Xem thêm" để lấy đủ nội dung</li>
              <li>✅ Tự động đóng dialog lỗi của Facebook (nếu có)</li>
            </ul>
          </li>
        </ol>

        <p><strong>💡 Tính năng mới:</strong></p>
        <ul>
          <li><strong>Infinite Scrolling:</strong> Tool không giới hạn số lần cuộn, chỉ dừng khi bạn bấm nút <strong>"⏹️ Dừng lại (Stop)"</strong>.</li>
          <li><strong>Auto "Xem thêm":</strong> Tự động click tất cả nút "Xem thêm" / "See more" để lấy nội dung đầy đủ.</li>
          <li><strong>Auto-dismiss Error:</strong> Tự động phát hiện và đóng popup lỗi "Truy vấn tìm kiếm bằng đồ thị không hợp lệ".</li>
        </ul>
      </section>

      <section class="guide-section">
        <h2>📄 2. Quản lý Fanpage</h2>
        <p>Đồng bộ danh sách Fanpage bạn quản lý.</p>
        <ol>
          <li>Vào tab <strong>Fanpage</strong>.</li>
          <li>Bấm <strong>Đồng bộ Fanpage</strong>.</li>
          <li>Danh sách Page sẽ hiện ra. Bạn có thể bật/tắt Page nào muốn dùng để đăng bài.</li>
        </ol>
      </section>

      <section class="guide-section info">
        <h2>🔍 3. Bộ lọc Thông minh (MỚI)</h2>
        <p>Giúp loại bỏ tin rác, tin spam tìm việc để lấy chính xác tin tuyển dụng.</p>

        <h3>⛔ Lọc từ khóa loại trừ (Negative Keywords)</h3>
        <p>Loại bỏ bài viết chứa các từ khóa không mong muốn.</p>
        <ul>
          <li>Vào tab <strong>"Từ khóa"</strong></li>
          <li>Tại mục <strong>"Bộ lọc"</strong>, nhập vào ô <strong>"Loại trừ từ khóa"</strong></li>
          <li>Ví dụ chặn tin tìm việc: <code>cần tìm việc, tìm việc làm, em cần tìm</code></li>
          <li>Bấm <strong>"Lưu bộ lọc"</strong> và chọn nút <strong>"Sử dụng"</strong></li>
        </ul>

        <h3>✅ Lọc bắt buộc (Required Keywords)</h3>
        <p>Chỉ lấy bài viết có chứa từ khóa bạn quan tâm.</p>
        <ul>
          <li>Khi dùng <strong>"Quét Group"</strong> hoặc <strong>"Ma trận"</strong></li>
          <li>Nếu bạn nhập từ khóa (ví dụ: <code>tuyển dụng</code>)</li>
          <li>Tool sẽ <strong>chỉ lấy bài viết nào có chữ "tuyển dụng"</strong></li>
          <li>Bỏ qua các bài viết tào lao khác trong group.</li>
        </ul>
      </section>

      <section class="guide-section">
        <h2>📅 4. Lịch đăng bài</h2>
        <p>Lên lịch hoặc đăng ngay lập tức.</p>
        <ul>
          <li><strong>Đăng ngay:</strong> Chọn bài viết từ Dashboard và bấm "Đăng ngay".</li>
          <li><strong>Lên lịch:</strong> Chọn thời gian trong tương lai. Extension sẽ tự động đăng khi đến giờ (yêu cầu mở trình duyệt).</li>
        </ul>
      </section>

      <section class="guide-section warning">
        <h2>⚠️ Lưu ý quan trọng</h2>
        <ul>
          <li><strong>Tránh Spam:</strong> Không nên đăng quá nhanh (dưới 1 phút/bài) để tránh bị Facebook khóa tính năng.</li>
          <li><strong>Checkpoint:</strong> Nếu Facebook yêu cầu xác minh danh tính, hãy tạm dừng tool và xác minh thủ công.</li>
          <li><strong>Lỗi "No Response":</strong> Thường do tab Facebook bị đóng hoặc treo. Hãy F5 lại tab Facebook và thử lại.</li>
          <li><strong>Nút "Dừng lại (Stop)":</strong> Nút này chỉ hiện khi đang chạy quét. Khi bấm "Bắt đầu quét", nút xanh sẽ đổi thành nút đỏ "⏹️ Dừng lại".</li>
        </ul>

        <h3>🐛 Xử lý lỗi thường gặp</h3>
        <ul>
          <li><strong>"Truy vấn tìm kiếm bằng đồ thị không hợp lệ":</strong> Tool giờ tự động đóng popup này. Nếu vẫn gặp, hãy thử đổi từ khóa hoặc group khác.</li>
          <li><strong>"Error receiving message: Attempting to use disconnected port":</strong> Lỗi này đã được fix với Polling Pattern. Nếu vẫn gặp, reload Extension.</li>
          <li><strong>Bài đăng hiện "Đang đăng..." quá lâu:</strong> Tool giờ có timeout 90 giây. Nếu quá 90s mà chưa xong, hãy kiểm tra kết nối mạng.</li>
          <li><strong>Không thấy bài viết sau khi quét Group:</strong> Kiểm tra xem bạn có quyền xem bài trong Group đó không (Group riêng tư cần phê duyệt).</li>
        </ul>
      </section>
      
      <section class="guide-section info">
         <h2>🛠️ Hỗ trợ kỹ thuật</h2>
         <p>Phiên bản: 2.0.0 (Profile Plus Supported)</p>
         <p><strong>Tính năng mới nhất (v2.0):</strong></p>
         <ul>
           <li>✅ Quét Group tự động (Infinite Scrolling)</li>
           <li>✅ Tự động đóng dialog lỗi Facebook</li>
           <li>✅ Polling Pattern (fix timeout khi đăng bài)</li>
           <li>✅ Tự động bấm "Xem thêm" (lấy nội dung đầy đủ)</li>
         </ul>
         <p>Nếu gặp lỗi, vui lòng chụp ảnh màn hình Console (F12) và gửi cho kỹ thuật viên.</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.guide-manager {
  max-width: 800px;
  margin: 0 auto;
}

h1 {
  font-size: 24px;
  color: #24292e;
  margin-bottom: 24px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e1e4e8;
}

.guide-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.guide-section {
  background: #fff;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.guide-section h2 {
  font-size: 18px;
  margin: 0 0 16px 0;
  color: #0366d6;
  display: flex;
  align-items: center;
  gap: 8px;
}

.guide-section h3 {
  font-size: 16px;
  margin: 16px 0 12px 0;
  color: #24292e;
  font-weight: 600;
}

.guide-section p {
  font-size: 14px;
  line-height: 1.6;
  color: #24292e;
  margin-bottom: 12px;
}

.guide-section ul, .guide-section ol {
  padding-left: 24px;
  font-size: 14px;
  line-height: 1.6;
  color: #24292e;
}

.guide-section li {
  margin-bottom: 8px;
}

.guide-section.warning {
  border-left: 4px solid #f9826c; /* Red/Orange for warning */
}

.guide-section.warning h2 {
  color: #d73a49;
}

.guide-section.info {
  background: #f1f8ff;
  border: 1px solid #c8e1ff;
}

.guide-section.info h2 {
  color: #0366d6;
}
</style>

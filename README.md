# Google Ads Dashboard | Silverland Hospitality

Dashboard theo dõi hiệu quả chiến dịch Google Ads của Silverland Sakyo và The Myst Đồng Khởi. Từ 23/11/2026 chỉ kéo số 2 khách sạn này (bỏ Bến Thành, Jolie, Yen, Sil, Mây cho đến khi cần).

- Xem online: https://digital-mkt-silverland.github.io/google-ads-dashboard/
- `index.html`: dashboard 1 file, có sẵn snapshot Google Ads đến 05/11/2026. Bản công khai không chứa số booking engine.
- `GoogleAds_Dashboard_AdsAPI.gs`: Apps Script gọi Google Ads API (chỉ đọc) cho 3 tài khoản:
  - 396-544-2048 Sakyo: mọi chiến dịch
  - 753-421-2327 TK chung: chỉ chiến dịch có chữ Sakyo hoặc Little Tokyo
  - 623-388-2444 The Myst: mọi chiến dịch

  Lần đầu (hoặc khi đổi danh sách tài khoản) lấy lại từ 01/01/2025: chiến dịch theo ngày, chi tiết (thị trường, độ tuổi, vị trí, từ khoá, headline) theo tháng cho phần cũ. Các lần sau chỉ lấy lại từ ngày 1 tháng trước đến hôm qua, giữ số cũ hơn. Ghi 4 tab Data, Dims, GeoNames, Info.
- `GoogleAds_Dashboard_Recon.gs`: đọc booking engine (sheet Data) và GA4 property 340245620, ghi tab Recon cho phần Đối soát tracking. Hiện chỉ đối soát Sakyo. The Myst dùng booking engine và GA4 riêng, chưa nối vào. Chỉ ghi số tổng hợp, không có thông tin khách.
- `Code_combined.gs`: gộp 2 file trên, dán vào Code.gs của project Apps Script.
- `GoogleAds_Dashboard_Export.js`: bản Google Ads Script chạy ở MCC (không dùng nữa vì lỗi uỷ quyền), giữ để tham khảo.

## Cài đặt (làm 1 lần)
1. Google Sheet của dashboard, chia sẻ "Bất kỳ ai có đường liên kết: Người xem".
2. Tiện ích mở rộng, Apps Script: dán `Code_combined.gs` vào Code.gs và `appsscript.json` vào manifest. Dịch vụ (+): Google Analytics Data API.
3. Project Settings: GCP project silverland-ga4-mcp (số 548318208693), đã bật Google Ads API mức Explorer (2.880 lượt gọi/ngày cho tài khoản thật), màn hình đồng ý OAuth ở trạng thái In production (quyền không hết hạn sau 7 ngày như chế độ Testing). Không cần developer token: Google bỏ developer token từ 09/09/2026, quyền gắn với Cloud project.
4. Chạy `runAds`, cấp quyền (màn hình "Google hasn't verified this app": Advanced, Go to, Continue). Chạy `runRecon`.
5. Chạy `installTrigger` một lần: runAds 6 đến 7 giờ, runRecon 8 đến 9 giờ mỗi ngày.
6. Dashboard, mục Nguồn data, dán link Sheet, Lưu và tải. Từ đó bấm Refresh là có data đến hôm qua.

Muốn lấy lại toàn bộ từ 01/01/2025: chạy `runAdsFull`.

Lưu ý: repo public, ai có link đều xem được số chi phí và doanh thu book date. Trang có thẻ noindex để hạn chế công cụ tìm kiếm.

## Sửa giao diện và build
- Sửa `src/template.html` (không sửa thẳng index.html).
- `python3 build.py`: ghi lại index.html (bản công khai, bỏ số booking engine).
- `DASH_SHEET_URL=<link Sheet> python3 build.py --private <đường dẫn>.html`: bản gửi riêng có sẵn link Sheet. Không commit file này, không ghi link Sheet vào repo.
- Link cá nhân thay cho file: link dashboard thêm `?sheet=<ID Sheet>` (mở 1 lần, trình duyệt nhớ).

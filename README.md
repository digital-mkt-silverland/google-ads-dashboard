# Google Ads Dashboard | Silverland Hospitality

Dashboard theo dõi hiệu quả chiến dịch Google Ads của Silverland Bến Thành, Sakyo, Jolie. Từ 06/11/2026 chỉ kéo số 3 khách sạn này (bỏ The Myst, Yen, Sil, Mây cho đến khi cần).

- Xem online: https://digital-mkt-silverland.github.io/google-ads-dashboard/
- `index.html`: dashboard 1 file, có sẵn snapshot Google Ads đến 05/11/2026. Bản công khai không chứa số booking engine.
- `GoogleAds_Dashboard_Export.js`: Google Ads Script chạy ở MCC 140-788-0633, chỉ đọc data, ghi Google Sheet hằng ngày để nút Refresh lấy data đến hôm qua. Booking của TK Bến Thành chỉ lấy chuyển đổi chính "Lượt mua hàng BT" từ 15/02/2025, tránh đếm trùng với "Mua hàng" giai đoạn 08 đến 12/2025.
- `GoogleAds_Dashboard_Recon.gs`: Apps Script gắn vào cùng Google Sheet, đọc booking engine (sheet Data) và GA4 property 340245620, ghi tab Recon cho phần Đối soát tracking. Chỉ ghi số tổng hợp, không có thông tin khách.

## Cập nhật tự động (làm 1 lần)
1. Tạo Google Sheet mới, chia sẻ "Bất kỳ ai có đường liên kết: Người xem".
2. Google Ads MCC: Công cụ, Hành động hàng loạt, Tập lệnh, dấu +. Dán `GoogleAds_Dashboard_Export.js`, thay `DAN_LINK_GOOGLE_SHEET_VAO_DAY` bằng link Sheet.
3. Uỷ quyền, Chạy, kiểm tra 4 tab Data, Dims, GeoNames, Info.
4. Tần suất: Hằng ngày 6:00.
5. Mở dashboard, mục Nguồn data, dán link Sheet, Lưu và tải. Từ đó bấm Refresh là có data đến hôm qua.

## Đối soát tracking (làm 1 lần)
1. Mở Google Sheet ở trên: Tiện ích mở rộng, Apps Script, dán `GoogleAds_Dashboard_Recon.gs`.
2. Dịch vụ (+), thêm Google Analytics Data API.
3. Chạy `runRecon`, cấp quyền. Sheet có tab Recon.
4. Chạy `installTrigger` một lần: tự chạy hằng ngày 8 đến 9 giờ.
5. Dashboard bấm Refresh, mục Đối soát tracking có số.

Lưu ý: repo public, ai có link đều xem được số chi phí và doanh thu book date. Trang có thẻ noindex để hạn chế công cụ tìm kiếm.

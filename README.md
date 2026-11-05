# Google Ads Dashboard | Silverland Hospitality

Dashboard theo dõi hiệu quả chiến dịch Google Ads của Silverland Bến Thành, Sakyo, Jolie (và Yen, Sil, Mây trong tài khoản dùng chung).

- Xem online: https://digital-mkt-silverland.github.io/google-ads-dashboard/
- `index.html`: dashboard 1 file, có sẵn snapshot data đến 04/11/2026.
- `GoogleAds_Dashboard_Export.js`: Google Ads Script chạy ở MCC 140-788-0633, chỉ đọc data, ghi Google Sheet hằng ngày để nút Refresh lấy data đến hôm qua.

## Cập nhật tự động (làm 1 lần)
1. Tạo Google Sheet mới, chia sẻ "Bất kỳ ai có đường liên kết: Người xem".
2. Google Ads MCC: Công cụ, Hành động hàng loạt, Tập lệnh, dấu +. Dán `GoogleAds_Dashboard_Export.js`, thay `DAN_LINK_GOOGLE_SHEET_VAO_DAY` bằng link Sheet.
3. Uỷ quyền, Chạy, kiểm tra 4 tab Data, Dims, GeoNames, Info.
4. Tần suất: Hằng ngày 6:00.
5. Mở dashboard, mục Nguồn data, dán link Sheet, Lưu và tải. Từ đó bấm Refresh là có data đến hôm qua.

Lưu ý: repo public, ai có link đều xem được số chi phí và doanh thu book date. Trang có thẻ noindex để hạn chế công cụ tìm kiếm.

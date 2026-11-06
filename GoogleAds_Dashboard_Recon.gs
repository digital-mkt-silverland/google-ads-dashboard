/**
 * SILVERLAND HOSPITALITY | DASHBOARD GOOGLE ADS: TAB "Recon" (ĐỐI SOÁT TRACKING)
 * -------------------------------------------------------------------------------
 * Apps Script gắn vào chính Google Sheet mà script MCC (GoogleAds_Dashboard_Export.js) đang ghi.
 * Script CHỈ ĐỌC: booking engine (sheet Data của file Booking Website SVL & The Myst) và GA4.
 * Ghi đè 1 tab "Recon" chỉ chứa số tổng hợp theo ngày x khách sạn x nguồn.
 * Không ghi tên, email, số điện thoại hay mã booking của khách.
 *
 * Cài một lần:
 *  1. Mở Google Sheet của dashboard > Tiện ích mở rộng > Apps Script > dán toàn bộ file này.
 *  2. Bên trái bấm "Dịch vụ" (+) > chọn "Google Analytics Data API" > Thêm.
 *  3. Chọn hàm runRecon > Chạy > cấp quyền (đọc Sheet booking, đọc GA4).
 *  4. Chọn hàm installTrigger > Chạy một lần: script tự chạy hằng ngày lúc 8 đến 9 giờ sáng.
 *  5. Trên dashboard bấm Refresh: phần Đối soát tracking lấy số mới.
 */

var RC = {
  BOOKING_SHEET_ID: '1pgn8Ujr843USchxY9RV198jLoCt6Mg7ihq78tygiByk',
  BOOKING_TAB: 'Data',
  GA4_PROPERTY: 'properties/340245620',
  START_DATE: '2025-01-01',
  OUT_TAB: 'Recon'
};
// Chỉ đối soát Bến Thành, Sakyo, Jolie. Thêm khách sạn khác vào 2 bảng dưới khi cần.
var IBE_HOTEL = { 'Silverland Ben Thanh': 'Bến Thành', 'Silverland Sakyo': 'Sakyo', 'Silverland Jolie': 'Jolie' };
var GA_HOTEL = { 'Silverland Ben Thanh': 'Bến Thành', 'Silverland Sakyo Hotel and Spa': 'Sakyo', 'Silverland Jolie Hotel and Spa': 'Jolie' };
var BUCKETS = ['Google Ads', 'Tìm kiếm tự nhiên', 'Trực tiếp', 'Tự giới thiệu (mất nguồn)', 'Trợ lý AI', 'Google Hotel Ads', 'Khác', 'Không có trong GA4'];
var HOSTS = ['booking.silverlandhotels.com', 'reservation.travelanium.net', 'khác'];

function runRecon() {
  var tz = 'Asia/Ho_Chi_Minh';
  var END = Utilities.formatDate(new Date(Date.now() - 864e5), tz, 'yyyy-MM-dd');

  // 1. Booking engine: cộng doanh thu mọi dòng phòng của cùng mã booking
  var sh = SpreadsheetApp.openById(RC.BOOKING_SHEET_ID).getSheetByName(RC.BOOKING_TAB);
  var last = sh.getLastRow(), h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (x) { return String(x).trim(); });
  // Ngày đặt lấy từ 3 cột Book day, Book Month, Book Year để không bị nhầm ngày/tháng khi ô Booking Date là kiểu Date
  var cDd = h.indexOf('Book day'), cDm = h.indexOf('Book Month'), cDy = h.indexOf('Book Year');
  var cH = h.indexOf('Hotel'), cN = h.indexOf('Booking Number'), cR = h.indexOf('Total Revenue');
  if (cDd < 0 || cDm < 0 || cDy < 0 || cH < 0 || cN < 0 || cR < 0) throw new Error('Sheet booking thiếu cột Book day, Book Month, Book Year, Hotel, Booking Number hoặc Total Revenue');
  function col(c) { return sh.getRange(2, c + 1, last - 1, 1).getDisplayValues(); }
  var VDd = col(cDd), VDm = col(cDm), VDy = col(cDy), VH = col(cH), VN = col(cN), VR = col(cR);
  var ibe = {}, through = '';
  for (var i = 0; i < VH.length; i++) {
    var hotel = IBE_HOTEL[String(VH[i][0]).trim()]; if (!hotel) continue;
    var dd = Number(VDd[i][0]), mm = Number(VDm[i][0]), yy = Number(VDy[i][0]);
    if (!dd || !mm || !yy) continue;
    var d = yy + '-' + ('0' + mm).slice(-2) + '-' + ('0' + dd).slice(-2); if (d < RC.START_DATE || d > END) continue;
    var id = String(VN[i][0]).trim(); if (!id) continue;
    var b = ibe[id] || (ibe[id] = { d: d, h: hotel, rev: 0 });
    b.rev += toNum(VR[i][0]); if (d > through) through = d;
  }

  // 2. GA4
  var sess = ga(['date', 'transactionId', 'sessionSourceMedium', 'sessionCampaignId', 'hostName'], ['purchaseRevenue', 'transactions'], END);
  var attr = ga(['date', 'transactionId', 'sourceMedium', 'campaignId'], ['keyEvents:purchase', 'totalRevenue'], END);
  var brandRows = ga(['transactionId', 'itemBrand'], ['itemRevenue'], END);
  var brand = {};
  brandRows.forEach(function (r) { var c = brand[r[0]] || (brand[r[0]] = {}); c[r[1]] = (c[r[1]] || 0) + 1; });
  function hotelOf(tid) { var c = brand[tid]; if (!c) return null; var best = null; for (var k in c) if (!best || c[k] > c[best]) best = k; return GA_HOTEL[best] || null; }
  var gaTx = {};
  sess.forEach(function (r) {
    var t = gaTx[r[1]] || (gaTx[r[1]] = { d: gaDate(r[0]), sm: r[2], cid: r[3], rev: 0 });
    t.rev += toNum(r[5]);
  });

  var out = [['kind', 'date', 'hotel', 'bucket', 'campaign_id', 'in_ibe', 'n', 'value']], agg = {};
  function put(k, n, val) { var a = agg[k] || (agg[k] = [0, 0]); a[0] += n; a[1] += val; }
  for (var id2 in ibe) {
    var bk = ibe[id2], g = gaTx[id2], bu = 7, cid = '';
    if (g) { bu = bucket(g.sm); if (bu === 0 && g.cid && g.cid !== '(not set)') cid = g.cid; }
    put(['ibe', bk.d, bk.h, BUCKETS[bu], cid, 1].join('\t'), 1, bk.rev);
  }
  for (var t2 in gaTx) {
    if (ibe[t2]) continue; var ht = hotelOf(t2); if (!ht) continue; var gg = gaTx[t2], bu2 = bucket(gg.sm);
    put(['gaonly', gg.d, ht, BUCKETS[bu2], bu2 === 0 && gg.cid !== '(not set)' ? gg.cid : '', 0].join('\t'), 1, gg.rev);
  }
  attr.forEach(function (r) {
    if (r[2] !== 'google / cpc') return; var ht = hotelOf(r[1]); if (!ht) return;
    put(['dda', gaDate(r[0]), ht, '', r[3] !== '(not set)' ? r[3] : '', ibe[r[1]] ? 1 : 0].join('\t'), toNum(r[4]), toNum(r[5]));
  });
  sess.forEach(function (r) {
    var ht = hotelOf(r[1]); if (!ht) return; var hi = HOSTS.indexOf(r[4]); if (hi < 0 || hi > 1) hi = 2;
    put(['host', gaDate(r[0]), ht, HOSTS[hi], '', 0].join('\t'), toNum(r[6]) || 1, 0);
  });
  Object.keys(agg).sort().forEach(function (k) { var p = k.split('\t'); out.push([p[0], p[1], p[2], p[3], p[4], Number(p[5]), round(agg[k][0], 3), Math.round(agg[k][1])]); });
  out.push(['info', '', 'through', through, '', '', '', '']);
  out.push(['info', '', 'run_at', Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm'), '', '', '', '']);

  var ss = SpreadsheetApp.getActiveSpreadsheet(), ws = ss.getSheetByName(RC.OUT_TAB) || ss.insertSheet(RC.OUT_TAB);
  ws.clearContents(); ws.getRange(1, 1, out.length, 8).setNumberFormat('@').setValues(out.map(function (r) { return r.map(String); }));
  Logger.log('Recon: ' + (out.length - 1) + ' dòng, booking engine đến ' + through + ', GA4 ' + Object.keys(gaTx).length + ' purchase');
}

function ga(dims, mets, end) {
  var rows = [], offset = 0, limit = 100000;
  while (true) {
    var res = AnalyticsData.Properties.runReport({
      dateRanges: [{ startDate: RC.START_DATE, endDate: end }],
      dimensions: dims.map(function (d) { return { name: d }; }), metrics: mets.map(function (m) { return { name: m }; }),
      limit: limit, offset: offset }, RC.GA4_PROPERTY);
    (res.rows || []).forEach(function (r) { rows.push(r.dimensionValues.map(function (x) { return x.value; }).concat(r.metricValues.map(function (x) { return x.value; }))); });
    offset += limit; if (!res.rowCount || offset >= res.rowCount) break;
  }
  return rows;
}
function bucket(sm) {
  var p = String(sm).split(' / '), s = (p[0] || '').toLowerCase(), m = (p[1] || '').toLowerCase();
  if (s === 'google' && m === 'cpc') return 0;
  if (s.indexOf('ghotelads') >= 0) return 5;
  if (m === 'ai-assistant' || /chatgpt|gemini\.google|perplexity|claude\.ai|copilot/.test(s)) return 4;
  if (/silverlandhotels\.com|travelanium|bookingx2|themystdongkhoihotel/.test(s)) return 3;
  if (m === 'organic') return 1;
  if (s === '(direct)' && m === '(none)') return 2;
  return 6;
}
function toISO(x, tz) {
  if (x instanceof Date) return Utilities.formatDate(x, tz, 'yyyy-MM-dd');
  var m = String(x).trim().match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : '';
}
function gaDate(s) { return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8); }
function toNum(x) { if (typeof x === 'number') return x; var n = Number(String(x).replace(/,/g, '')); return isFinite(n) ? n : 0; }
function round(v, d) { var p = Math.pow(10, d); return Math.round(v * p) / p; }
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'runRecon') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('runRecon').timeBased().everyDays(1).atHour(8).inTimezone('Asia/Ho_Chi_Minh').create();
}

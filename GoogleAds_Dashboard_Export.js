/**
 * SILVERLAND HOSPITALITY | GOOGLE ADS DASHBOARD EXPORT
 * ----------------------------------------------------
 * Chạy trong tài khoản MCC (SILVERLAND HOSPITALITY 140-788-0633).
 * Script CHỈ ĐỌC số liệu, không sửa chiến dịch, ngân sách, giá thầu.
 * Mỗi lần chạy ghi đè 4 tab trong Google Sheet:
 *   Data      : chi phí, hiển thị, nhấp, chuyển đổi theo ngày x chiến dịch
 *   Dims      : thị trường (vị trí người dùng), độ tuổi, vị trí target, từ khoá, headline/description
 *   GeoNames  : tên các mã vị trí
 *   Info      : thời điểm chạy, data đến ngày nào
 * Lịch chạy đề xuất: Hằng ngày, 6:00 sáng. Dashboard bấm Refresh là có data đến hôm qua.
 */

var CONFIG = {
  SPREADSHEET_URL: 'DAN_LINK_GOOGLE_SHEET_VAO_DAY',
  ACCOUNT_IDS: ['645-385-5576', '753-421-2327', '396-544-2048', '623-388-2444'],
  START_DATE: '2025-01-01',     // ngày bắt đầu lấy data
  DAILY_DIM_MONTHS: 3,          // số tháng gần nhất lấy breakdown theo ngày (cũ hơn lấy theo tháng)
  // Chuyển đổi booking chính của từng tài khoản. Từ ngày "from", bookings chỉ lấy đúng hành động này,
  // tránh đếm trùng khi tài khoản có nhiều hành động mua hàng cùng là chuyển đổi chính (Bến Thành 08 đến 12/2025).
  // Tài khoản không có trong danh sách: bookings = mọi chuyển đổi chính loại Mua hàng.
  MAIN_PURCHASE: { '6453855576': { name: 'Lượt mua hàng BT', from: '2025-02-15' } },
  // Chuyển đổi nhập từ GA4 (phụ), dùng cho phần Đối soát tracking
  GA4_IMPORT_SUFFIX: '(web) purchase'
};

var DATA_HEADER = ['date', 'account_id', 'account_name', 'campaign_id', 'campaign_name', 'campaign_status', 'channel_type',
  'cost', 'impressions', 'clicks', 'conversions', 'conv_value', 'bookings', 'booking_value', 'checkouts',
  'search_is', 'search_lost_is_budget', 'search_lost_is_rank', 'ga4_import', 'ga4_import_value'];
var DIMS_HEADER = ['dim', 'start', 'end', 'account_id', 'campaign_id', 'k1', 'k2', 'cost', 'impressions', 'clicks', 'conversions', 'conv_value'];

function main() {
  var tz = AdsApp.currentAccount().getTimeZone();
  var yesterday = new Date(new Date().getTime() - 24 * 3600 * 1000);
  var END = Utilities.formatDate(yesterday, tz, 'yyyy-MM-dd');
  var y = Number(END.slice(0, 4)), m = Number(END.slice(5, 7));
  var cm = m - CONFIG.DAILY_DIM_MONTHS; var cy = y; while (cm <= 0) { cm += 12; cy -= 1; }
  var CUT = cy + '-' + pad(cm) + '-01';                       // từ ngày này lấy breakdown theo ngày
  var BEFORE_CUT = shiftDay(CUT, -1, tz);

  var dataRows = [DATA_HEADER], dimRows = [DIMS_HEADER], geoIds = {};
  var accounts = getAccounts();
  for (var i = 0; i < accounts.length; i++) {
    var acc = accounts[i];
    if (typeof AdsManagerApp !== 'undefined') AdsManagerApp.select(acc);
    var accId = acc.getCustomerId().replace(/-/g, '');
    var accName = acc.getName();
    Logger.log('Đang đọc ' + accName + ' (' + accId + ')');
    pullCampaigns(accId, accName, CONFIG.START_DATE, END, dataRows);
    pullDims(accId, CONFIG.START_DATE, BEFORE_CUT, CUT, END, dimRows, geoIds);
  }
  var geoRows = pullGeoNames(Object.keys(geoIds));

  var ss = SpreadsheetApp.openByUrl(CONFIG.SPREADSHEET_URL);
  writeSheet(ss, 'Data', dataRows);
  writeSheet(ss, 'Dims', dimRows);
  writeSheet(ss, 'GeoNames', geoRows);
  writeSheet(ss, 'Info', [['key', 'value'], ['run_at', Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm')], ['data_through', END], ['daily_dims_from', CUT], ['accounts', accounts.length]]);
  Logger.log('Xong: ' + (dataRows.length - 1) + ' dòng Data, ' + (dimRows.length - 1) + ' dòng Dims, data đến ' + END);
}

function getAccounts() {
  if (typeof AdsManagerApp === 'undefined') return [AdsApp.currentAccount()];
  var out = [], it = AdsManagerApp.accounts().withIds(CONFIG.ACCOUNT_IDS).get();
  while (it.hasNext()) out.push(it.next());
  return out;
}

function pullCampaigns(accId, accName, start, end, out) {
  var conv = {};
  var q2 = 'SELECT segments.date, campaign.id, segments.conversion_action_category, metrics.conversions, metrics.conversions_value, metrics.all_conversions ' +
    'FROM campaign WHERE segments.date BETWEEN "' + start + '" AND "' + end + '" ' +
    'AND segments.conversion_action_category IN ("PURCHASE","BEGIN_CHECKOUT")';
  var it2 = AdsApp.search(q2);
  while (it2.hasNext()) {
    var r = it2.next(), k = r.segments.date + '|' + r.campaign.id;
    var c = conv[k] || (conv[k] = [0, 0, 0]);
    if (r.segments.conversionActionCategory === 'PURCHASE') { c[0] += num(r.metrics.conversions); c[1] += num(r.metrics.conversionsValue); }
    else c[2] += num(r.metrics.allConversions);
  }
  var main = CONFIG.MAIN_PURCHASE[accId], ca = {};
  var q3 = 'SELECT segments.date, campaign.id, segments.conversion_action_name, metrics.all_conversions, metrics.all_conversions_value ' +
    'FROM campaign WHERE segments.date BETWEEN "' + start + '" AND "' + end + '" AND segments.conversion_action_category = "PURCHASE"';
  var it3 = AdsApp.search(q3);
  while (it3.hasNext()) {
    var r3 = it3.next(), k3 = r3.segments.date + '|' + r3.campaign.id, n3 = r3.segments.conversionActionName;
    var x = ca[k3] || (ca[k3] = [0, 0, 0, 0]);
    if (main && n3 === main.name) { x[0] += num(r3.metrics.allConversions); x[1] += num(r3.metrics.allConversionsValue); }
    if (n3.slice(-CONFIG.GA4_IMPORT_SUFFIX.length) === CONFIG.GA4_IMPORT_SUFFIX) { x[2] += num(r3.metrics.allConversions); x[3] += num(r3.metrics.allConversionsValue); }
  }
  var q = 'SELECT segments.date, campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, ' +
    'metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, ' +
    'metrics.search_impression_share, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share ' +
    'FROM campaign WHERE segments.date BETWEEN "' + start + '" AND "' + end + '" AND metrics.impressions > 0';
  var it = AdsApp.search(q);
  while (it.hasNext()) {
    var r = it.next(), m = r.metrics, key = r.segments.date + '|' + r.campaign.id, c = (conv[key] || [0, 0, 0]).slice(), x = ca[key] || [0, 0, 0, 0];
    if (main && r.segments.date >= main.from) { c[0] = x[0]; c[1] = x[1]; }
    out.push([r.segments.date, accId, accName, String(r.campaign.id), r.campaign.name, r.campaign.status, r.campaign.advertisingChannelType,
      Math.round(num(m.costMicros) / 1e6), num(m.impressions), num(m.clicks), round(num(m.conversions), 3), Math.round(num(m.conversionsValue)),
      round(c[0], 3), Math.round(c[1]), round(c[2], 2), opt(m.searchImpressionShare), opt(m.searchBudgetLostImpressionShare), opt(m.searchRankLostImpressionShare), round(x[2], 3), Math.round(x[3])]);
  }
}

function pullDims(accId, start, beforeCut, cut, end, out, geoIds) {
  var M = 'metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value';
  var defs = [
    { dim: 'geo', from: 'user_location_view', f: 'user_location_view.country_criterion_id', w: 'metrics.impressions > 0', recent: 'date',
      key: function (r) { var id = r.userLocationView.countryCriterionId; geoIds[id] = 1; return ['g' + id, '']; } },
    { dim: 'age', from: 'age_range_view', f: 'ad_group_criterion.age_range.type', w: 'metrics.impressions > 0', recent: 'date',
      key: function (r) { return [String(r.adGroupCriterion.ageRange.type).replace('AGE_RANGE_', ''), '']; } },
    { dim: 'tloc', from: 'location_view', f: 'campaign_criterion.location.geo_target_constant', w: 'metrics.impressions > 0', recent: 'date',
      key: function (r) { var g = r.campaignCriterion && r.campaignCriterion.location && r.campaignCriterion.location.geoTargetConstant; var id = g ? String(g).split('/')[1] : '0'; if (id !== '0') geoIds[id] = 1; return ['t' + id, '']; } },
    { dim: 'kw', from: 'keyword_view', f: 'ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type', w: 'metrics.impressions > 0', recent: 'date',
      key: function (r) { return [r.adGroupCriterion.keyword.text, r.adGroupCriterion.keyword.matchType]; } },
    { dim: 'asset', from: 'ad_group_ad_asset_view', f: 'ad_group_ad_asset_view.field_type, asset.text_asset.text', recent: 'week',
      w: 'metrics.impressions > 0 AND ad_group_ad_asset_view.field_type IN ("HEADLINE","DESCRIPTION")',
      key: function (r) { return ['RSA|' + r.adGroupAdAssetView.fieldType, (r.asset.textAsset && r.asset.textAsset.text) || '']; } },
    { dim: 'asset', from: 'asset_group_asset', f: 'asset_group_asset.field_type, asset.text_asset.text', recent: 'week',
      w: 'metrics.impressions > 0 AND asset_group_asset.field_type IN ("HEADLINE","DESCRIPTION","LONG_HEADLINE")',
      key: function (r) { return ['PMax|' + r.assetGroupAsset.fieldType, (r.asset.textAsset && r.asset.textAsset.text) || '']; } }
  ];
  defs.forEach(function (d) {
    var agg = {};
    var periods = [];
    if (beforeCut >= start) periods.push({ seg: 'month', s: start, e: beforeCut });
    periods.push({ seg: d.recent, s: cut, e: end });
    periods.forEach(function (p) {
      var q = 'SELECT segments.' + p.seg + ', campaign.id, ' + d.f + ', ' + M + ' FROM ' + d.from +
        ' WHERE segments.date BETWEEN "' + p.s + '" AND "' + p.e + '" AND ' + d.w;
      var it;
      try { it = AdsApp.search(q); } catch (e) { Logger.log('Bỏ qua ' + d.dim + ': ' + e); return; }
      while (it.hasNext()) {
        var r = it.next(), seg = r.segments[p.seg], s, e;
        if (p.seg === 'month') { s = seg; e = monthEnd(seg); if (e > p.e) e = p.e; }
        else if (p.seg === 'week') { s = seg < p.s ? p.s : seg; e = addDays(seg, 6); if (e > p.e) e = p.e; }
        else { s = e = seg; }
        var kk = d.key(r);
        var key = [s, e, r.campaign.id, kk[0], kk[1]].join('\u0001');
        var a = agg[key] || (agg[key] = [s, e, String(r.campaign.id), kk[0], kk[1], 0, 0, 0, 0, 0]);
        a[5] += num(r.metrics.costMicros); a[6] += num(r.metrics.impressions); a[7] += num(r.metrics.clicks);
        a[8] += num(r.metrics.conversions); a[9] += num(r.metrics.conversionsValue);
      }
    });
    for (var k in agg) {
      var a = agg[k];
      out.push([d.dim, a[0], a[1], accId, a[2], a[3], a[4], Math.round(a[5] / 1e6), a[6], a[7], round(a[8], 2), Math.round(a[9])]);
    }
  });
}

function pullGeoNames(ids) {
  var rows = [['id', 'name', 'country_code', 'target_type', 'canonical_name']];
  for (var i = 0; i < ids.length; i += 300) {
    var chunk = ids.slice(i, i + 300);
    var q = 'SELECT geo_target_constant.id, geo_target_constant.name, geo_target_constant.country_code, geo_target_constant.target_type, geo_target_constant.canonical_name ' +
      'FROM geo_target_constant WHERE geo_target_constant.id IN (' + chunk.join(',') + ')';
    var it = AdsApp.search(q);
    while (it.hasNext()) {
      var g = it.next().geoTargetConstant;
      rows.push([String(g.id), g.name, g.countryCode || '', g.targetType || '', g.canonicalName || '']);
    }
  }
  return rows;
}

function writeSheet(ss, name, rows) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  var cols = rows[0].length;
  // Định dạng văn bản thuần để dashboard đọc đúng mọi cột
  sh.getRange(1, 1, Math.max(rows.length, 1), cols).setNumberFormat('@');
  var CH = 20000;
  for (var i = 0; i < rows.length; i += CH) {
    var part = rows.slice(i, i + CH).map(function (r) { return r.map(function (v) { return v === null || v === undefined ? '' : String(v); }); });
    sh.getRange(i + 1, 1, part.length, cols).setValues(part);
  }
  var extra = sh.getMaxRows() - rows.length;
  if (extra > 1000) sh.deleteRows(rows.length + 1, extra - 10);
}

/* helpers */
function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function opt(v) { if (v === undefined || v === null || v === '') return ''; var n = Number(v); return isFinite(n) ? round(n, 4) : ''; }
function round(v, d) { var p = Math.pow(10, d); return Math.round(v * p) / p; }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function addDays(s, n) { var d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) + n * 864e5); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
function shiftDay(s, n) { return addDays(s, n); }
function monthEnd(s) { var y = +s.slice(0, 4), m = +s.slice(5, 7); var d = new Date(Date.UTC(y, m, 0)); return y + '-' + pad(m) + '-' + pad(d.getUTCDate()); }

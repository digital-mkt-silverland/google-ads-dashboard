/**
 * SILVERLAND HOSPITALITY | DASHBOARD GOOGLE ADS: TAB Data, Dims, GeoNames, Info
 * ------------------------------------------------------------------------------
 * Chạy trong cùng project Apps Script với script Recon (gắn vào Google Sheet của dashboard).
 * Gọi thẳng Google Ads API qua quyền của người cài, thay cho Google Ads Script ở MCC.
 * CHỈ ĐỌC số liệu, không sửa chiến dịch, ngân sách, giá thầu.
 *
 * Mỗi lần chạy lấy số từ ngày 1 của tháng trước đến hôm qua (đủ để cập nhật chuyển đổi về trễ),
 * ghi đè 4 tab. Dashboard giữ số cũ của snapshot trước ngày "data_from" và thay bằng số mới từ ngày đó.
 *
 * Cài một lần:
 *  1. Google Cloud project của script (Project Settings) phải bật "Google Ads API".
 *  2. Project Settings > Script Properties > Add: DEVELOPER_TOKEN = developer token của MCC
 *     (Google Ads MCC > Công cụ > Trung tâm API). Không dán token vào code.
 *  3. Chạy hàm runAds, bấm Continue để cấp thêm quyền Google Ads.
 *  4. Chạy installTrigger: runAds chạy 6 đến 7 giờ, runRecon chạy 8 đến 9 giờ mỗi ngày.
 */

var ADS_CONFIG = {
  API_VERSION: 'v26',
  LOGIN_CUSTOMER_ID: '1407880633',                       // MCC SILVERLAND HOSPITALITY
  ACCOUNT_IDS: ['6453855576', '7534212327', '3965442048'], // Bến Thành, TK chung (Jolie, Sakyo), Sakyo
  MONTHS_BACK: 1,                                         // lấy từ ngày 1 của N tháng trước
  MAIN_PURCHASE: { '6453855576': { name: 'Lượt mua hàng BT', from: '2025-02-15' } },
  GA4_IMPORT_SUFFIX: '(web) purchase',
  EXCLUDE_CAMPAIGN: /(^|[^a-z])(yen|sil)([^a-z]|$)|mây|(^|[^a-z])may([^a-z]|$)|myst/i,
  KEEP_CAMPAIGN: /sakyo|little tokyo|jolie|bến thành|ben thanh|(^|[^a-z])bt([^a-z]|$)/i
};

function runAds() { AdsApiExport.run(); }

var AdsApiExport = (function () {
  var DATA_HEADER = ['date', 'account_id', 'account_name', 'campaign_id', 'campaign_name', 'campaign_status', 'channel_type',
    'cost', 'impressions', 'clicks', 'conversions', 'conv_value', 'bookings', 'booking_value', 'checkouts',
    'search_is', 'search_lost_is_budget', 'search_lost_is_rank', 'ga4_import', 'ga4_import_value'];
  var DIMS_HEADER = ['dim', 'start', 'end', 'account_id', 'campaign_id', 'k1', 'k2', 'cost', 'impressions', 'clicks', 'conversions', 'conv_value'];
  var TOKEN, SKIP = {};

  function search(cid, q) {
    var res = UrlFetchApp.fetch('https://googleads.googleapis.com/' + ADS_CONFIG.API_VERSION + '/customers/' + cid + '/googleAds:searchStream', {
      method: 'post', contentType: 'application/json', payload: JSON.stringify({ query: q }), muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'developer-token': TOKEN, 'login-customer-id': ADS_CONFIG.LOGIN_CUSTOMER_ID }
    });
    var code = res.getResponseCode(), body = res.getContentText();
    if (code !== 200) throw new Error('Google Ads API ' + code + ' (TK ' + cid + '): ' + body.slice(0, 600));
    var rows = [];
    JSON.parse(body).forEach(function (b) { (b.results || []).forEach(function (r) { rows.push(r); }); });
    return rows;
  }

  function run() {
    TOKEN = PropertiesService.getScriptProperties().getProperty('DEVELOPER_TOKEN');
    if (!TOKEN) throw new Error('Chưa có DEVELOPER_TOKEN trong Project Settings > Script Properties');
    var tz = 'Asia/Ho_Chi_Minh';
    var END = Utilities.formatDate(new Date(Date.now() - 864e5), tz, 'yyyy-MM-dd');
    var y = +END.slice(0, 4), m = +END.slice(5, 7) - ADS_CONFIG.MONTHS_BACK;
    while (m <= 0) { m += 12; y -= 1; }
    var START = y + '-' + pad(m) + '-01';
    var dataRows = [DATA_HEADER], dimRows = [DIMS_HEADER], geoIds = {}, names = [];
    ADS_CONFIG.ACCOUNT_IDS.forEach(function (cid) {
      var c = search(cid, 'SELECT customer.descriptive_name FROM customer LIMIT 1');
      var name = c.length ? c[0].customer.descriptiveName : cid;
      names.push(name + ' (' + cid + ')');
      pullCampaigns(cid, name, START, END, dataRows);
      pullDims(cid, START, END, dimRows, geoIds);
    });
    var geoRows = pullGeoNames(Object.keys(geoIds));
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    writeSheet(ss, 'Data', dataRows);
    writeSheet(ss, 'Dims', dimRows);
    writeSheet(ss, 'GeoNames', geoRows);
    writeSheet(ss, 'Info', [['key', 'value'], ['run_at', Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm')], ['data_through', END],
      ['data_from', START], ['accounts', names.join('; ')]]);
    Logger.log('Google Ads: ' + (dataRows.length - 1) + ' dòng Data, ' + (dimRows.length - 1) + ' dòng Dims, từ ' + START + ' đến ' + END);
  }

  function pullCampaigns(cid, name, start, end, out) {
    var W = ' WHERE segments.date BETWEEN "' + start + '" AND "' + end + '"';
    var conv = {}, ca = {}, main = ADS_CONFIG.MAIN_PURCHASE[cid];
    search(cid, 'SELECT segments.date, campaign.id, segments.conversion_action_category, metrics.conversions, metrics.conversions_value, metrics.all_conversions FROM campaign' + W +
      ' AND segments.conversion_action_category IN ("PURCHASE","BEGIN_CHECKOUT")').forEach(function (r) {
      var k = r.segments.date + '|' + r.campaign.id, c = conv[k] || (conv[k] = [0, 0, 0]);
      if (r.segments.conversionActionCategory === 'PURCHASE') { c[0] += num(r.metrics.conversions); c[1] += num(r.metrics.conversionsValue); }
      else c[2] += num(r.metrics.allConversions);
    });
    search(cid, 'SELECT segments.date, campaign.id, segments.conversion_action_name, segments.conversion_action_category, metrics.all_conversions, metrics.all_conversions_value FROM campaign' + W +
      ' AND segments.conversion_action_category = "PURCHASE"').forEach(function (r) {
      var k = r.segments.date + '|' + r.campaign.id, n = r.segments.conversionActionName, x = ca[k] || (ca[k] = [0, 0, 0, 0]);
      if (main && n === main.name) { x[0] += num(r.metrics.allConversions); x[1] += num(r.metrics.allConversionsValue); }
      if (n.slice(-ADS_CONFIG.GA4_IMPORT_SUFFIX.length) === ADS_CONFIG.GA4_IMPORT_SUFFIX) { x[2] += num(r.metrics.allConversions); x[3] += num(r.metrics.allConversionsValue); }
    });
    search(cid, 'SELECT segments.date, campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, metrics.cost_micros, metrics.impressions, metrics.clicks, ' +
      'metrics.conversions, metrics.conversions_value, metrics.search_impression_share, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share FROM campaign' + W +
      ' AND metrics.impressions > 0').forEach(function (r) {
      if (ADS_CONFIG.EXCLUDE_CAMPAIGN.test(r.campaign.name) && !ADS_CONFIG.KEEP_CAMPAIGN.test(r.campaign.name)) { SKIP[cid + ':' + r.campaign.id] = 1; return; }
      var mt = r.metrics, key = r.segments.date + '|' + r.campaign.id, c = (conv[key] || [0, 0, 0]).slice(), x = ca[key] || [0, 0, 0, 0];
      if (main && r.segments.date >= main.from) { c[0] = x[0]; c[1] = x[1]; }
      out.push([r.segments.date, cid, name, String(r.campaign.id), r.campaign.name, r.campaign.status, r.campaign.advertisingChannelType,
        Math.round(num(mt.costMicros) / 1e6), num(mt.impressions), num(mt.clicks), round(num(mt.conversions), 3), Math.round(num(mt.conversionsValue)),
        round(c[0], 3), Math.round(c[1]), round(c[2], 2), opt(mt.searchImpressionShare), opt(mt.searchBudgetLostImpressionShare), opt(mt.searchRankLostImpressionShare),
        round(x[2], 3), Math.round(x[3])]);
    });
  }

  function pullDims(cid, start, end, out, geoIds) {
    var M = 'metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value';
    var defs = [
      { dim: 'geo', from: 'user_location_view', f: 'user_location_view.country_criterion_id', w: 'metrics.impressions > 0',
        key: function (r) { var id = r.userLocationView.countryCriterionId; geoIds[id] = 1; return ['g' + id, '']; } },
      { dim: 'age', from: 'age_range_view', f: 'ad_group_criterion.age_range.type', w: 'metrics.impressions > 0',
        key: function (r) { return [String(r.adGroupCriterion.ageRange.type).replace('AGE_RANGE_', ''), '']; } },
      { dim: 'tloc', from: 'location_view', f: 'campaign_criterion.location.geo_target_constant', w: 'metrics.impressions > 0',
        key: function (r) { var g = r.campaignCriterion && r.campaignCriterion.location && r.campaignCriterion.location.geoTargetConstant; var id = g ? String(g).split('/')[1] : '0'; if (id !== '0') geoIds[id] = 1; return ['t' + id, '']; } },
      { dim: 'kw', from: 'keyword_view', f: 'ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type', w: 'metrics.impressions > 0',
        key: function (r) { return [r.adGroupCriterion.keyword.text, r.adGroupCriterion.keyword.matchType]; } },
      { dim: 'asset', from: 'ad_group_ad_asset_view', f: 'ad_group_ad_asset_view.field_type, asset.text_asset.text',
        w: 'metrics.impressions > 0 AND ad_group_ad_asset_view.field_type IN ("HEADLINE","DESCRIPTION")',
        key: function (r) { return ['RSA|' + r.adGroupAdAssetView.fieldType, (r.asset.textAsset && r.asset.textAsset.text) || '']; } },
      { dim: 'asset', from: 'asset_group_asset', f: 'asset_group_asset.field_type, asset.text_asset.text',
        w: 'metrics.impressions > 0 AND asset_group_asset.field_type IN ("HEADLINE","DESCRIPTION","LONG_HEADLINE")',
        key: function (r) { return ['PMax|' + r.assetGroupAsset.fieldType, (r.asset.textAsset && r.asset.textAsset.text) || '']; } }
    ];
    defs.forEach(function (d) {
      var rows;
      try {
        rows = search(cid, 'SELECT segments.date, campaign.id, ' + d.f + ', ' + M + ' FROM ' + d.from +
          ' WHERE segments.date BETWEEN "' + start + '" AND "' + end + '" AND ' + d.w);
      } catch (e) { Logger.log('Bỏ qua ' + d.dim + ' (' + cid + '): ' + e.message); return; }
      var agg = {};
      rows.forEach(function (r) {
        if (SKIP[cid + ':' + r.campaign.id]) return;
        var s = r.segments.date, kk = d.key(r), key = [s, r.campaign.id, kk[0], kk[1]].join('\u0001');
        var a = agg[key] || (agg[key] = [s, s, String(r.campaign.id), kk[0], kk[1], 0, 0, 0, 0, 0]);
        a[5] += num(r.metrics.costMicros); a[6] += num(r.metrics.impressions); a[7] += num(r.metrics.clicks);
        a[8] += num(r.metrics.conversions); a[9] += num(r.metrics.conversionsValue);
      });
      for (var k in agg) { var a = agg[k]; out.push([d.dim, a[0], a[1], cid, a[2], a[3], a[4], Math.round(a[5] / 1e6), a[6], a[7], round(a[8], 2), Math.round(a[9])]); }
    });
  }

  function pullGeoNames(ids) {
    var rows = [['id', 'name', 'country_code', 'target_type', 'canonical_name']];
    for (var i = 0; i < ids.length; i += 300) {
      search(ADS_CONFIG.ACCOUNT_IDS[0], 'SELECT geo_target_constant.id, geo_target_constant.name, geo_target_constant.country_code, geo_target_constant.target_type, geo_target_constant.canonical_name ' +
        'FROM geo_target_constant WHERE geo_target_constant.id IN (' + ids.slice(i, i + 300).join(',') + ')').forEach(function (r) {
        var g = r.geoTargetConstant; rows.push([String(g.id), g.name, g.countryCode || '', g.targetType || '', g.canonicalName || '']);
      });
    }
    return rows;
  }

  function writeSheet(ss, name, rows) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.clearContents();
    var cols = rows[0].length;
    sh.getRange(1, 1, Math.max(rows.length, 1), cols).setNumberFormat('@');
    for (var i = 0; i < rows.length; i += 20000) {
      var part = rows.slice(i, i + 20000).map(function (r) { return r.map(function (v) { return v === null || v === undefined ? '' : String(v); }); });
      sh.getRange(i + 1, 1, part.length, cols).setValues(part);
    }
  }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function opt(v) { if (v === undefined || v === null || v === '') return ''; var n = Number(v); return isFinite(n) ? round(n, 4) : ''; }
  function round(v, d) { var p = Math.pow(10, d); return Math.round(v * p) / p; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  return { run: run };
})();

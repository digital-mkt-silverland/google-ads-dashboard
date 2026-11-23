#!/usr/bin/env python3
"""Build dashboard từ src/template.html.

  python3 build.py                       # ghi index.html (bản công khai, không có số booking engine)
  DASH_SHEET_URL=<link Google Sheet> python3 build.py --private OUT.html
                                         # thêm bản gửi riêng: có sẵn link Sheet, mở là tự nối

Dữ liệu snapshot lấy từ khối <script id="rawdata"> của index.html hiện tại (hoặc --data file.json).
Số mới hằng ngày không nằm trong file: dashboard đọc Google Sheet khi mở trang.
Không commit bản --private vào repo công khai.
"""
import argparse, json, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))

def current_data():
    html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    m = re.search(r'<script id="rawdata" type="application/json">(.*?)</script>', html, re.S)
    if not m:
        sys.exit('Không tìm thấy khối rawdata trong index.html')
    return m.group(1)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--private', help='đường dẫn bản gửi riêng (có link Sheet)')
    ap.add_argument('--data', help='file JSON snapshot thay cho dữ liệu trong index.html')
    a = ap.parse_args()
    tpl = open(os.path.join(ROOT, 'src', 'template.html'), encoding='utf-8').read()
    assert tpl.count('/*__DATA__*/') == 1 and tpl.count("''/*__SHEET__*/") == 1, 'template thiếu placeholder'
    data = open(a.data, encoding='utf-8').read() if a.data else current_data()
    j = json.loads(data)
    j.pop('recon', None)  # bản công khai không chứa số booking engine
    pub = tpl.replace('/*__DATA__*/', json.dumps(j, ensure_ascii=False, separators=(',', ':')))
    open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8').write(pub)
    print('index.html', round(len(pub) / 1e6, 2), 'MB')
    if a.private:
        SHEET = os.environ.get('DASH_SHEET_URL', '').strip()
        if not SHEET:
            sys.exit('Đặt biến môi trường DASH_SHEET_URL = link Google Sheet của dashboard (không ghi link vào repo)')
        priv = tpl.replace('/*__DATA__*/', data).replace("''/*__SHEET__*/", "'" + SHEET + "'")
        open(a.private, 'w', encoding='utf-8').write(priv)
        print(a.private, round(len(priv) / 1e6, 2), 'MB')

if __name__ == '__main__':
    main()

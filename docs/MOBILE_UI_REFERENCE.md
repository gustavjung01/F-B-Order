# Mobile UI Reference - Bep Si F&B

File nay la kim chi nam chua cho UI mobile. Khi lam frontend, bam theo 3 man hinh preview da tao trong chat:

1. Home
2. Product catalog
3. Recipes

## 1. Home screen

Muc tieu: vao app la thay ngay day la app dat hang nguyen lieu F&B cho quan.

Can co:

- Header co logo Bep Si F&B.
- Dia chi giao hang / khu vuc khach.
- Search icon va cart icon.
- Hero banner lon ve nguyen lieu pha che.
- CTA mua ngay / xem bang hang.
- Danh muc nhanh: Tra sua, Mi cay, Topping, Combo.
- San pham noi bat dang card ngang.
- Chuong trinh hom nay / ma giam gia.
- Cong thuc F&B de giu chan khach.
- Bottom navigation mobile.

Style:

- Nen trang/am kem.
- Mau chinh cam do / orange.
- Card bo tron lon.
- Anh san pham lon, gia ro.
- Text ngan, de bam bang ngon tay.

## 2. Product catalog screen

Muc tieu: khach tim hang va them gio that nhanh.

Can co:

- Header title San pham.
- Search bar ro rang.
- Banner bang hang si.
- Filter/category tabs.
- Sap xep: ban chay, gia si, hang moi.
- Product card/list co anh, ten, trang thai con hang, gia, gia cu neu co, stepper so luong, nut them gio.
- Cart badge hien so luong.

Style:

- List doc, moi item cao vua du.
- Nut them gio mau cam, noi bat.
- Gia hien mau cam/do.
- Ten san pham 2 dong la toi da.

## 3. Recipes screen

Muc tieu: khach mo app de xem cong thuc, sau do them nguyen lieu vao gio.

Can co:

- Header title Cong thuc.
- Search icon.
- Tabs: Tat ca, Tra sua, Tra trai cay, Da xay.
- Recipe card doc: anh mon, tag Moi, ten, mo ta ngan, thoi gian, do kho, bookmark.
- CTA trong chi tiet sau nay: Them nguyen lieu vao gio.

Style:

- Anh do uong chat luong tot.
- Card bo tron, khoang trang rong.
- Text ro, it mau phu.

## Bottom nav chuan

5 tab:

- Trang chu
- San pham
- Cong thuc
- Gio hang
- Tai khoan

Active tab dung mau cam.

## Nguyen tac lam UI tiep theo

- Mobile first.
- Lam bang mock data truoc, API noi sau.
- Khong lam layout desktop phuc tap luc nay.
- Moi man hinh phai co CTA ro: xem san pham, them gio, xem cong thuc, dat lai don.
- Hinh anh quan trong hon text dai.
- Su dung bo tron lon, shadow nhe, spacing thoang.

## Noi luu anh preview trong repo

Khi copy anh tu chat ve local, luu vao:

```text
apps/frontend/public/design/mobile-preview.png
```

Sau do co the xem tai:

```text
/design/mobile-preview.png
```

Lenh push tu local:

```powershell
git add apps/frontend/public/design/mobile-preview.png docs/MOBILE_UI_REFERENCE.md
git commit -m "docs: add mobile UI reference"
git push origin main
```

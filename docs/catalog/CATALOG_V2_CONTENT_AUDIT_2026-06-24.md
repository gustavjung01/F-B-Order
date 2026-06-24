# Bếp Sỉ — Audit tên và ảnh catalog v2 (24/06/2026)

## Kết luận

Catalog hiện tại chưa đạt điều kiện chốt nội dung dù dữ liệu kỹ thuật đã có `182` sản phẩm cha và `275` biến thể.

Các vấn đề được tách rõ:

1. **6 SKU chắc chắn thiếu ảnh** và phải tải thủ công.
2. **34 SKU cần xác minh danh tính trực tiếp từ bao bì/ảnh** vì tên nguồn mơ hồ, chứa nhiều phân loại hoặc dùng viết tắt nội bộ.
3. **10 parent map cần review lại** vì có option `khác`, gộp sản phẩm khác bản chất hoặc cover chưa đủ tin cậy.
4. Nhiều tên có lỗi chính tả, viết tắt, sai đơn vị hoặc không theo cấu trúc bán hàng.
5. Việc object ảnh tồn tại trên CDN chỉ chứng minh có file, **không chứng minh ảnh đúng sản phẩm**.

## Cấu trúc tên bắt buộc

- Tên biến thể: `[Loại sản phẩm] [Thương hiệu] [Phân loại chính] [Dung tích/khối lượng]`.
- Tên parent: `[Loại sản phẩm] [Thương hiệu hoặc dòng sản phẩm]`.
- Đơn vị chuẩn: `L`, `ml`, `kg`, `g`.
- Không để các từ nội bộ trong tên cuối: `khác`, `các loại`, `Cty`, `TC`, `ĐĐ`, `TS`, `SÔ`, `MÔN`, `HG`.
- Một SKU không được ghi hai phân loại bằng `/` hoặc `+` nếu thực tế là hai sản phẩm khác nhau.

## Sáu ảnh phải tải thủ công

| SKU | Tên chuẩn đề xuất | File bắt buộc |
|---|---|---|
| BGKQ-0015 | Sinh tố Berrino Dâu | `bgkq-0015.webp` |
| BGKQ-0068 | Trân châu cà phê Gia Uy mini | `bgkq-0068.webp` |
| BGKQ-0108 | Flan Mota | `bgkq-0108.webp` |
| BGKQ-0109 | Flan Mota Sô-cô-la | `bgkq-0109.webp` |
| BGKQ-0120 | Bột milk foam Erdoli | `bgkq-0120.webp` |
| BGKQ-0276 | Ruốc | `bgkq-0276.webp` |

Danh sách máy đọc nằm tại:

`data/catalog/hung-phat/v2/manual-image-upload.csv`

## Nhóm cần xác minh ảnh và danh tính trước khi sửa tên

Các SKU ưu tiên cao gồm:

- `BGKQ-0007`: một dòng chứa hai vị dâu/đường đen.
- `BGKQ-0061`: chưa chốt Deasang hay Daesang.
- `BGKQ-0062`: tên là siro nhưng nhóm nguồn là Đường Đen.
- `BGKQ-0072`: chuỗi Minh Hạnh/Kunhan không rõ thương hiệu.
- `BGKQ-0083`, `BGKQ-0087`: dùng tên “các loại”.
- `BGKQ-0085`: “Thủy Tinh Hùng Chương” chưa xác định đúng loại topping.
- `BGKQ-0091`: Sốt Gold còn option “khác”.
- `BGKQ-0092`, `BGKQ-0096`, `BGKQ-0106`: tên nguồn không đủ rõ.
- `BGKQ-0151`–`BGKQ-0153`: dòng Trà số 9/HT 9 chưa được gọi tên chuẩn.
- `BGKQ-0162`, `BGKQ-0164`, `BGKQ-0168`: một SKU đang chứa hai loại sen/lài hoặc xanh/đỏ.
- `BGKQ-0191`: sương sáo trắng/đen trong một dòng.
- `BGKQ-0193`, `BGKQ-0194`: “Ice Hot lùn” và “Rich lùn” cần đọc tên thương mại/dung tích trên bao bì.
- `BGKQ-0211`: nắp cầu/vuông trong một SKU.
- `BGKQ-0217`: Cuộn ép đang bị gom vào parent Bao ly.
- `BGKQ-0225`–`BGKQ-0227`: tên quá chung, giá hiện là 0, thiếu quy cách.
- `BGKQ-0231`, `BGKQ-0232`: “Cá Sing”, “Cá Cút” cần xác minh sản phẩm thực tế.
- `BGKQ-0263`, `BGKQ-0264`: chưa chốt thương hiệu/tên sốt bánh gạo.
- `BGKQ-0273`: Nước bò thiếu dung tích thật.

Danh sách đầy đủ 34 SKU và lý do nằm trong:

`data/catalog/hung-phat/v2/catalog-content-audit.json`

## Parent map bắt buộc review

- `siro-gtp`
- `siro-vina`
- `flan-mota`
- `tra-phuc-long`
- `tra-thai`
- `bao-ly`
- `mi-koreno`
- `nuoc-bo`
- `tran-chau-kuhan`
- `sot-gold`

Không được cập nhật DB dựa trên các nhóm này trước khi xem ảnh, chốt tên và chốt cách gom.

## Audit board cho đủ 275 SKU

Chạy tại local repo:

```powershell
cd "F:\1_A_Disk_D\F&B-Order"
pnpm catalog:audit:content:v2
start artifacts\catalog\hung-phat-v2-content-audit\index.html
```

Output:

- `catalog-content-audit.csv`: đủ 275 SKU.
- `manual-image-upload.csv`: ảnh chắc chắn thiếu.
- `priority-image-review.csv`: tên/parent/ảnh cần xem trước.
- `name-review.csv`: tên cần sửa hoặc xác minh.
- `index.html`: bảng ảnh CDN cạnh tên hiện tại, tên đề xuất, SKU và parent map.

Quy trình duyệt:

1. Mở `index.html`.
2. So ảnh với tên đề xuất và SKU.
3. Ảnh sai: chuẩn bị file WebP đúng tên `bgkq-XXXX.webp`.
4. Ghi tên đã chốt và ghi chú vào CSV audit.
5. Chỉ sau khi duyệt đủ mới lập thay đổi source map/R2/DB riêng.

## Phạm vi thay đổi hiện tại

- Có sửa UI hiển thị 20 sản phẩm và nút **Xem thêm**.
- Có bổ sung lựa chọn **Đông Lạnh** và ẩn bộ lọc thương hiệu khi chọn Đông Lạnh.
- Có thêm công cụ audit tên/ảnh cho đủ 275 SKU.
- **Không import DB.**
- **Không migration.**
- **Không upload hoặc sửa R2/CDN.**
- **Không deploy VPS.**

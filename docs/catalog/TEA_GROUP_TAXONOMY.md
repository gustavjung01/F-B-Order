# Nhóm sản phẩm — Nguyên liệu trà sữa

## Phạm vi

Cấu trúc này chỉ áp dụng cho ngành `nguyen-lieu-tra-sua`.

Không thay đổi hoặc suy luận lại sản phẩm thuộc các ngành:

- Nguyên liệu mì cay
- Đông lạnh
- Nguyên liệu bánh tráng
- Bao bì

## Nguồn chuẩn

- Danh sách nhóm: `data/catalog/hung-phat/v2/tea-group-taxonomy.json`
- Mapping đã duyệt: `data/catalog/hung-phat/v2/tea-product-group-map.csv`
- Script kiểm tra: `scripts/catalog/hung-phat-v2/build-tea-group-audit.mjs`

Không dùng `subcategory`, `source_group` hoặc từ khóa trong tên sản phẩm để tự động quyết định nhóm mới.
Những trường cũ chỉ xuất hiện trong bảng audit để người quản trị đối chiếu.

## Quy trình duyệt

Chạy:

```bash
pnpm catalog:audit:tea-groups:v2
```

Kết quả được tạo tại:

```text
data/catalog/hung-phat/v2/generated/tea-product-group-audit.csv
```

Mỗi card cha chưa được mapping sẽ có trạng thái:

```text
REVIEW_REQUIRED
```

Sau khi duyệt một sản phẩm, thêm đúng một dòng vào `tea-product-group-map.csv`:

```csv
parent_key,catalog_group_key,status,note
siro-mama-gold,siro,APPROVED,Đã duyệt thủ công
```

Chỉ chấp nhận `status=APPROVED`. Group key phải tồn tại trong taxonomy.

## Nguyên tắc phát hành

Bộ lọc nhóm con trà sữa chỉ được bật khi:

1. Mapping đã được duyệt thủ công.
2. Audit không còn lỗi key hoặc mapping chéo ngành.
3. Backend trả đúng tổng số và phân trang theo group.
4. Catalog boundary và Core order contract đều xanh.

Cho đến thời điểm đó, production chỉ lọc theo ngành nguyên liệu; thương hiệu chỉ hiển thị trên card sản phẩm.

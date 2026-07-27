# Full production catalog audit

## Mục tiêu

Audit read-only toàn bộ catalog đã remap trên production trước khi mở batch sản phẩm mới. Audit không sửa database, không chạy migration, không restart service và không ghi/xóa R2.

Audit ID: `FULL-PRODUCTION-CATALOG-AUDIT-01`.

## Phạm vi

- `TEA-NOVIA-01`
- `TEA-BATCH-02`
- `TEA-BATCH-03`
- `SIRO-BATCH-01`
- `SIRO-BATCH-02`
- `SINH-TO-MUT-CORRECTION-01`
- `DUONG-DEN-BATCH-01`
- `TRAN-CHAU-BATCH-01`
- `3Q-GION-BATCH-01`

`SINH-TO-MUT-BATCH-01` không được audit như một trạng thái độc lập vì đã được `SINH-TO-MUT-CORRECTION-01` thay thế. Audit correction bao phủ trạng thái cuối của đủ 25 SKU.

## Kiểm tra trên từng SKU

- canonical SKU tồn tại duy nhất;
- parent key, parent name và brand;
- variant name, trạng thái active/public/orderable và price mode;
- giá production dương, giá thùng dẫn xuất và reference giá;
- quy cách bán lẻ, định lượng và số lượng/thùng;
- COUNT_ONLY không giữ size/weight/volume giả;
- product type và flavor theo chính sách thuộc tính đã được phê duyệt;
- mọi legacy SKU trỏ đúng canonical variant qua alias table;
- recipe product ID và snapshot nhất quán;
- tham chiếu cart/order/price và image object key được báo cáo;
- catalog API có SKU và trả đúng type/flavor ở các nhóm đã có chuẩn rõ ràng.

## Chính sách loại/vị

- Sinh tố/Mứt correction kiểm cứng theo manifest mới.
- Hai batch Siro kiểm cứng `type=siro` và `flavor=<type cũ của từng SKU>` vì tên nhóm và tên SKU cung cấp căn cứ rõ.
- Tea, Đường đen, Trân châu và 3Q dùng manifest legacy một trường `type`; audit không tự đoán product type. Các dòng chưa tách được loại/vị được báo `WARN` để thiết kế correction riêng.

## Giá

Giá nguồn thương mại nằm trong payload private và không commit Git. Audit này:

- kiểm giá production là số dương;
- báo giá thùng dẫn xuất bằng giá lẻ × số lượng đóng gói;
- kiểm reference trong `catalog_variant_prices`;
- không dựng lại hoặc đoán giá nguồn private.

Đối chiếu tuyệt đối với bảng giá private chỉ được thực hiện khi runner production được cấp đúng payload private tương ứng.

## Chạy self-test

```bash
pnpm --filter @fb-order/backend catalog:production:audit:self-test
```

Kết quả yêu cầu:

```text
FULL_PRODUCTION_CATALOG_AUDIT_SELF_TEST_PASS
```

## Chạy production read-only

Runner cần `DATABASE_URL` hoặc `BEPSI_DATABASE_URL`, đồng thời API Bếp Sỉ tại port 5100 phải đọc được.

```bash
pnpm --filter @fb-order/backend catalog:production:audit
```

Artifacts:

- `artifacts/catalog-audit/full-production-catalog-audit.json`
- `artifacts/catalog-audit/full-production-catalog-audit.csv`
- `artifacts/catalog-audit/full-production-catalog-audit-summary.md`

## Trạng thái dòng

- `PASS`: không phát hiện sai lệch trong phạm vi có thể chứng minh.
- `WARN`: cần chuẩn hóa hoặc thiếu nguồn để kết luận, nhưng không có sai lệch phá vỡ contract production.
- `BLOCKED`: thiếu SKU, sai parent, alias sai, quy cách sai, recipe mismatch, type/flavor sai ở nhóm đã có chuẩn, hoặc variant không orderable.

Audit có `BLOCKED` trả exit code `2`. Audit chỉ có `WARN` vẫn tạo đủ artifact và không sửa production.

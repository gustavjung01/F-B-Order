# Catalog remap progress

- Cập nhật: 2026-07-25
- Nhánh: `agent/catalog-commercial-map-trial`
- PR: #106 — chờ CI và merge
- Production: chưa migration `031/032`, chưa apply catalog, chưa ghi/xóa ảnh R2

## Quy tắc khóa

1. `REMAP` giữ `variantId`; cập nhật recipe theo cả `variantId + productId` trong cùng transaction.
2. `CREATE_NEW` không tạo alias giả vào SKU gộp cũ.
3. Thiếu ảnh không chặn SKU; ảnh bổ sung thủ công, không tạo ảnh AI.
4. `COUNT_ONLY` dùng cho hàng bán theo hộp/gói đếm được; không điền `0 g` hoặc tự đoán khối lượng.
5. Không commit workbook, payload giá private hoặc báo cáo production.
6. Merge code không đồng nghĩa apply production. Apply chỉ được chạy sau migration, dry-run PASS và phê duyệt production riêng.

## Tổng quan phần chưa merge

Chỉ còn **1 PR mở: #106**. PR này chứa toàn bộ hạ tầng commercial-map và ba batch Trà dưới đây.

| Task | SKU | Trạng thái dữ liệu | Việc còn lại sau merge |
|---|---:|---|---|
| `TEA-NOVIA-01` | 3 | `DRY_RUN_PASS` | Migration `031` + phê duyệt apply |
| `TEA-BATCH-02` | 18 | `DRY_RUN_PASS` | Migration `031` + phê duyệt apply |
| `TEA-BATCH-03` | 27 | `AUDIT_PASS` | Chạy dry-run read-only; sau đó migration `031/032` + phê duyệt apply |

## TEA-NOVIA-01

- Mapping: `BGKQ-0170 → TRGANO`, `BGKQ-0171 → TRDENN`, `BGKQ-0172 → TRLANO`.
- Audit và dry-run production read-only đã PASS.
- Chưa apply production.

## TEA-BATCH-02

- 16 `REMAP` + 2 `CREATE_NEW`: `TXABON`, `TXABIE`.
- Audit: 18/18 PASS, blocked=0.
- Dry-run: 18/18 PASS, blocked=0.
- `canApplyNow=false`, `canApplyAfterMigration=true`.
- Payload private hash: `64788440c741397acf8ecd74fd821b376f474cb43af861d2b4d8f918d1d243e5`.
- Chưa apply production.

## TEA-BATCH-03

- 27 SKU: 8 `REMAP` + 19 `CREATE_NEW`.
- Quy cách: 14 `MEASURED` + 13 `COUNT_ONLY`.
- Audit production read-only: **27/27 PASS, blocked=0**.
- Verification: `data/catalog-remap/tea-batch-03-audit-verification.json`.
- Payload private hash: `1191f9072d6a3679082bdda2b137220bc514a605679a34ba23682da9b6542ff0`.
- Không migration, không sửa DB/R2/service trong audit.
- Bước dữ liệu còn lại: chạy dry-run production read-only.

Quy cách người dùng chốt trực tiếp:

```text
HTRKIG = 500 g/bịch; 30 bịch/bao
TR9DXN = 500 g/bịch; 10 bịch/thùng
TRLPLL = COUNT_ONLY; 20 hộp/thùng
TROPLL = COUNT_ONLY; 20 hộp/thùng
COZMAT = 1000 g/bịch; 30 bịch/thùng
```

11 SKU Cozy mới dùng `COUNT_ONLY`, bán theo hộp và 30 hộp/thùng. Các SKU gộp cũ `BGKQ-0162`, `0164`, `0166`, `0167`, `0168` vẫn tồn tại độc lập.

## Hạ tầng trong PR #106

- Migration `030`: commercial import batch snapshots và rollback.
- Migration `031`: catalog group remap và SKU alias.
- Migration `032`: packaging `COUNT_ONLY`.
- Validator payload có SHA-256, chặn SKU trùng, giá/quy cách sai và dữ liệu `0` giả.
- Dry-run dùng transaction read-only.
- Apply yêu cầu confirm hash và cổng remote-write rõ ràng.
- API/frontend hỗ trợ hiển thị `COUNT_ONLY` như `30 hộp/thùng`, không hiện `0 g` hoặc `null g`.

## Production gate

Chỉ thực hiện khi có phê duyệt riêng, rõ ràng:

1. Chạy migration đúng thứ tự trên backend Bếp Sỉ `/srv/apps/bepsi`.
2. Chỉ thao tác `bepsi-api.service`, `bepsi-ai-worker.service` và port 5100 khi thật sự cần.
3. Apply đúng task bằng manifest hash, before/after snapshot và rollback batch.
4. Hậu kiểm API, frontend, cart, order và recipe.
5. Không thao tác hai backend khác trên cùng VPS.

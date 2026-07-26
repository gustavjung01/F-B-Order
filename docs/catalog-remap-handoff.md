# Bàn giao Catalog Remap — Bếp Sỉ

> Cập nhật lần cuối: 2026-07-26  
> Repo: `gustavjung01/F-B-Order`  
> Mục tiêu: để chat mới tiếp tục đúng trạng thái, không lặp việc, không đụng nhầm backend khác và không tự sửa dữ liệu chưa được xác nhận.

## 1. Quy tắc bắt buộc

1. Chỉ làm trong dự án Bếp Sỉ.
2. VPS có nhiều app/backend. Chỉ được thao tác:
   - root: `/srv/apps/bepsi`
   - releases: `/srv/apps/bepsi/releases/<commit>`
   - symlink hiện hành: `/srv/apps/bepsi/current`
   - env: `/etc/app-env/bepsi.env`
   - API service: `bepsi-api.service`
   - worker: `bepsi-ai-worker.service`
   - port: `5100`
3. Không đụng bất kỳ app, service, port hoặc thư mục VPS nào khác.
4. Không commit workbook nguồn, private payload giá, báo cáo production đầy đủ hoặc bí mật.
5. Private payload phải nằm dưới `data/private/...` và phải được `git check-ignore` xác nhận.
6. Không ghi/xóa R2 trong các batch catalog hiện tại.
7. Không tự restart service nếu quy trình không yêu cầu.
8. Production chỉ được chạy sau khi:
   - static contract PASS;
   - database dry-run PASS;
   - CI đúng head xanh;
   - chủ dự án cấp quyền production riêng bằng câu rõ phạm vi.
9. API `/api/catalog-v2/products/:id` dùng **variant UUID**, không dùng product UUID.
10. Engine production hiện vẫn yêu cầu chuỗi legacy:
    - `--confirm-production=BEPSI_TEA_48`
11. Khi apply production phải có:
    - fresh PostgreSQL 17 backup;
    - `pg_restore -l` kiểm backup;
    - fresh dry-run ngay trước apply;
    - DB verify;
    - API verify bằng variant UUID;
    - automatic rollback nếu hậu kiểm lỗi.

## 2. Máy local và SSH

Local repo đang dùng:

```text
F:\1_A_Disk_D\thao-dev\thao-gateway\workspaces\F-B-Order
```

Một local path khác từng được ghi nhận:

```text
F:\1_A_Disk_D\F&B-Order
```

SSH:

```text
ubuntu@40.233.83.234
```

Key path trên máy người dùng:

```text
F:\1_A_Disk_D\khuong-binh\TK\Orcle\vps-40.233.83.234-backend\ssh-key-1-1-E1.key
```

Không commit key hoặc nội dung key.

## 3. Chính sách map catalog

- Map toàn bộ dòng sạch trước.
- Dòng thiếu quy cách, xung đột thương hiệu, đơn vị không chắc chắn hoặc dữ liệu bằng 0 chỉ append vào:

```text
data/catalog-remap/catalog-normalization-backlog.csv
```

- Không tạo note hoặc Excel riêng.
- Không đưa giá private vào backlog.
- Chỉ review backlog một lần sau khi hoàn tất toàn bộ catalog.
- Giữ nguyên spelling canonical từ nguồn, ví dụ `VIỆT QUỐC`, `ERODELI`, `KUNHAN`; không tự sửa âm thầm.

## 4. Hạ tầng remap

Các file engine chính:

```text
apps/backend/scripts/catalog-remap-batch-engine.mjs
apps/backend/scripts/catalog-remap-batch-common.mjs
apps/backend/scripts/catalog-remap-batch-state.mjs
apps/backend/scripts/catalog-remap-batch-apply.mjs
apps/backend/scripts/catalog-remap-batch-verify.mjs
apps/backend/scripts/run-catalog-remap-plan-dry-run-vps-root.mjs
```

Migrations bắt buộc:

```text
db/migrations/031_catalog_group_remap.sql
db/migrations/032_catalog_packaging_count_only.sql
```

Status engine cần nhớ:

```text
TEA_PRODUCTION_DRY_RUN_PASS
TEA_PRODUCTION_APPLY_PASS
```

Tên status vẫn dùng `TEA_...` cho mọi nhóm vì đây là status legacy của engine.

Các trường verify quan trọng:

```text
canonicalVariantCount
remapAliasCount
createNewCount
measuredCount
countOnlyCount
recipeMismatchCount
activeParentCount
```

Rollback sẽ từ chối nếu after-state đã diverge hoặc có batch sau phụ thuộc.

## 5. Các batch đã xác nhận production

### 5.1 Tea — 48 SKU

- 48 SKU
- 27 REMAP
- 21 CREATE_NEW
- Production đã verify.

### 5.2 Siro Batch 01 — 39 SKU

- 39 SKU
- 4 REMAP
- 35 CREATE_NEW
- PR #108
- Production đã verify.

### 5.3 Siro Batch 02 — 30 SKU

- 30 SKU
- 1 REMAP
- 29 CREATE_NEW
- PR #109
- Production đã verify.

### 5.4 Sinh tố / Mứt Batch 01 — 23 SKU

- 23 SKU
- 22 REMAP
- 1 CREATE_NEW: `BERMCA`
- PR #110
- merge baseline: `9e5aefb146b427a6cf4796099f14041d44ed458c`
- Production đã verify.

Manifest:

```text
data/catalog-remap/sinh-to-mut-batch-01.json
```

Plan:

```text
data/catalog-remap/sinh-to-mut-batch-01-plan.json
```

Phạm vi manifest hiện tại:

- Berino: 12 SKU, `1350 g/chai`, 12 chai/thùng.
- Gold: 11 SKU, `1300 g/chai`, 12 chai/thùng.
- Parent Berino: `sinh-to-berino`.
- Parent Gold hiện trong manifest: `mut-gold`, name `Mứt Gold`, brand `Gold`.

Danh sách Berino trong batch:

```text
BERDAU
BERDAO
BEROIH
BERVQU
BERCDA
BERVAI
BERPBT
BERXOA
BERNHO
BERDTM
BERTHM
BERMCA
```

Danh sách Gold trong batch:

```text
STGDAU
STGDAO
STGVQU
STGCDA
STGKWI
STGXOA
STGOIH
STGDTM
STGMCA
STGVAI
STGNHO
```

Hold liên quan:

- `BERKWI`: nguồn ghi 13 g/chai.
- `STGPBT`: nguồn ghi 0 g/chai.
- Vina 1L: tên 1L nhưng nguồn ghi 1300 g/chai.
- Vina 650g: nguồn ghi 0 g/hũ.

### 5.5 Đường đen / Đường nước Batch 01 — 6 SKU

- PR #111 đã merge.
- merge commit: `6ba161f209f9e88c3302bb14c01c2f796e0b5a64`
- 5 REMAP + 1 CREATE_NEW.
- Production đã verify bằng output thật từ máy người dùng.

SKU:

```text
BGKQ-0054 -> DDSEUL
BGKQ-0055 -> DNSEUL
BGKQ-0056 -> DDDLTB
BGKQ-0057 -> DDMOLA
CREATE_NEW -> SRDDER
BGKQ-0069 -> TCDDGU
```

Parent:

```text
duong-monita
duong-den-dai-loan
duong-den-mola
duong-den-erodeli
duong-den-gia-uy
```

Điểm an toàn đặc biệt:

- `TCDDGU` chỉ được tách riêng sang `duong-den-gia-uy`.
- Không được kéo các variant trân châu Gia Uy khác sang parent đường đen.

Final production status đã xác nhận:

```text
DUONG_DEN_BATCH_01_PRODUCTION_VERIFIED
canonicalVariants: 6
remapAliases: 5
createNew: 1
measured: 6
countOnly: 0
activeParents: 5
apiProductsVerified: 5
recipeMismatchCount: 0
giaUySiblingVariantsPreserved: true
```

Backup production:

```text
/srv/apps/bepsi/backups/catalog-remap/bepsi-before-duong-den-6-20260726T092049Z.dump
```

Local final report:

```text
F:\1_A_Disk_D\thao-dev\thao-gateway\workspaces\F-B-Order\artifacts\catalog-remap\production\duong-den-batch-01-final.json
```

Sau batch này, tổng canonical SKU đã xác nhận production là **146**.

## 6. Batch hiện tại: Trân châu Batch 01

### 6.1 Trạng thái Git

- PR #112 đã merge.
- head đã dry-run: `d5622c3ced5d5ac0a351d0ae38dfef0136b65a35`
- squash merge commit: `b2bcf6a5992f8b21e9a2f80beadfa9b29426c755`
- CI đúng head đã xanh 4/4:
  - Migration CI
  - Recipe Version analysis
  - Core order contract
  - Catalog boundary

### 6.2 Scope

- 4 REMAP
- 0 CREATE_NEW
- 2 parent
- 4/4 database dry-run PASS
- production apply đã được chủ dự án cấp quyền, nhưng **chưa có output final production được xác nhận trong cuộc chat trước**.

Mapping:

```text
BGKQ-0068 -> TCMNGU  (TC GIA UY MINI)
BGKQ-0070 -> TCTRGU  (TC GIA UY TRẮNG)
BGKQ-0071 -> TCCFGU  (TC GIA UY CAFE)
BGKQ-0073 -> KH2KDD  (TCĐĐ KUNHAN 2KG)
```

Parent:

```text
tran-chau-gia-uy
tran-chau-kunhan
```

Manifest:

```text
data/catalog-remap/tran-chau-batch-01.json
```

Plan:

```text
data/catalog-remap/tran-chau-batch-01-plan.json
```

Manifest hash:

```text
2a7998459e7a8c2fe3b703434bb664fba337c21a0236e65d5582c9ec2b446e6c
```

Private payload hash đã rematerialize và dùng cho dry-run:

```text
781a52a2a46c001f8cd4b14f7270a3e19ede0cf5a0009eeb2df9fb077b3bc6a1
```

Hash profile:

```text
standard
```

Dry-run report:

```text
F:\1_A_Disk_D\thao-dev\thao-gateway\workspaces\F-B-Order\artifacts\catalog-remap\production\tran-chau-batch-01-dry-run.json
```

Dry-run output đã xác nhận:

```text
TRAN_CHAU_BATCH_01_DRY_RUN_VERIFIED
Rows: 4
Pass: 4
Blocked: 0
```

### 6.3 Backlog Trân châu

`KH3KHK` đang hold vì:

- tên bảng quán ghi Duoxian;
- tên chuẩn hóa ghi Kunhan;
- candidate legacy `BGKQ-0067` cũng là Douxian.

Không remap `BGKQ-0067` khi chưa chốt thương hiệu thật.

### 6.4 Chốt an toàn khi production

Bắt buộc hậu kiểm:

1. `TCDDGU` vẫn ở `duong-den-gia-uy`.
2. `BGKQ-0067` Douxian giữ nguyên variant ID, product ID và product key.
3. `TCMNGU`, `TCTRGU`, `TCCFGU` ở `tran-chau-gia-uy`.
4. `KH2KDD` ở `tran-chau-kunhan`.
5. 4 aliases, 4 packaging specs, measured 4, count-only 0.
6. API verify đủ 2 parent bằng variant UUID.

### 6.5 Việc đầu tiên chat mới phải làm

Không được tự rerun production ngay.

Kiểm tra local final report trước:

```powershell
$path = "F:\1_A_Disk_D\thao-dev\thao-gateway\workspaces\F-B-Order\artifacts\catalog-remap\production\tran-chau-batch-01-final.json"
if (Test-Path $path) {
  $final = Get-Content $path -Raw | ConvertFrom-Json
  $final.status
  $final.verification | Format-List
} else {
  "NO_FINAL_REPORT"
}
```

Nếu status là:

```text
TRAN_CHAU_BATCH_01_PRODUCTION_VERIFIED
```

thì batch đã xong; không chạy lại.

Giá trị đúng phải là:

```text
canonicalVariants: 4
remapAliases: 4
createNew: 0
measured: 4
countOnly: 0
activeParents: 2
apiProductsVerified: 2
recipeMismatchCount: 0
tcdDguParentPreserved: true
douxianVariantPreserved: true
```

Nếu không có final report, hỏi người dùng output gần nhất của script `apply-tran-chau-batch-01.ps1` trước khi quyết định. Không suy đoán production đã chạy.

## 7. Vấn đề đang mở: GoldenFarm / Gold / Berino và thiếu vị

Đây là việc người dùng vừa phát hiện, chưa được sửa.

### 7.1 Điều đã xác nhận

- Manifest hiện **không ghi `Mama Gold`**.
- Manifest đang ghi:

```text
productKey: mut-gold
name: Mứt Gold
brand: Gold
```

- Việc gọi sản phẩm này là `Mama Gold` trong trả lời trước là sai, không có căn cứ từ manifest.
- Người dùng cho biết mã đang nói tới có thể là **GoldenFarm** và tên Gold hiện tại có thể sai/thiếu.
- Người dùng đồng thời báo **2 mã bị thiếu vị**.

### 7.2 Điều chưa xác định

- Chưa chốt chính xác 2 SKU nào bị thiếu vị.
- Chưa chốt toàn bộ nhóm `STG...` là Golden Farm hay chỉ một phần.
- Chưa có bằng chứng đủ để rename parent `mut-gold` trên production.
- Chưa rõ thiếu vị nằm ở field name, type, options, API response hay frontend display.

### 7.3 Cách audit đúng

Chat mới phải làm theo thứ tự:

1. Hỏi người dùng ảnh màn hình hoặc mã SKU cụ thể của 2 dòng thiếu vị nếu chưa có.
2. Đối chiếu:
   - `data/catalog-remap/sinh-to-mut-batch-01.json`
   - `data/catalog-remap/sinh-to-mut-batch-01-review.csv`
   - source workbook gốc
   - DB production read-only
   - API Catalog V2 bằng variant UUID
3. Kiểm tra các field:
   - parent name/brand/productKey
   - variant `name`
   - variant `sku`
   - `options.type`
   - packaging
   - API response variants
   - frontend label được dựng từ field nào
4. Không rename parent hoặc sửa production cho đến khi:
   - xác định đúng 2 SKU;
   - xác định nhãn thương hiệu thật từ nguồn/bao bì;
   - dry-run correction PASS;
   - chủ dự án cấp quyền production riêng.

### 7.4 Nguồn file

File nguồn từng dùng trong cuộc chat:

```text
BANG_GIA_KENH_QUAN_MAP_APP_BO_SUNG.xlsx
BẢNG GIÁ KÊNH QUÁN.xlsx
Giá Thùng.xlsx
```

Các file upload cũ có thể không tồn tại trong chat mới. Nếu cần audit chính xác GoldenFarm/Berino, yêu cầu người dùng upload lại file liên quan; không bịa dữ liệu từ trí nhớ.

### 7.5 Dữ liệu quy cách hiện có

- Berino trong manifest: `1350 g/chai`, 12 chai/thùng.
- Gold trong manifest: `1300 g/chai`, 12 chai/thùng.
- Đây là **khối lượng tịnh**, không phải dung tích ml/lít.
- Không tự chuyển 1350 g thành 1.35 L hoặc 1300 g thành 1.3 L.
- Nếu app cũ có `1 L`, phải xem đó là field riêng và xác minh bằng nguồn/nhãn trước khi đưa lại vào canonical packaging.

## 8. Backlog chung

File duy nhất:

```text
data/catalog-remap/catalog-normalization-backlog.csv
```

Các nhóm đã append gồm:

- Siro Batch 02
- Sinh tố / Mứt Batch 01
- Đường đen Batch 01
- Trân châu Batch 01

Không tạo backlog thứ hai.

## 9. Production approval phrases

Chỉ production khi người dùng nói đúng phạm vi rõ ràng.

Ví dụ đã dùng:

```text
CHO PHÉP merge PR #111 và apply production DUONG-DEN-BATCH-01 gồm 6 SKU trên backend Bếp Sỉ
```

```text
CHO PHÉP merge PR #112 và apply production TRAN-CHAU-BATCH-01 gồm 4 SKU trên backend Bếp Sỉ
```

Từ `tiếp`, `làm tiếp`, `ok` hoặc nội dung mơ hồ không đủ quyền production.

## 10. Checklist chat mới

1. Đọc file này trước.
2. `git switch main && git pull --ff-only origin main`.
3. Xác nhận production Trân châu bằng final report, không đoán.
4. Không chạy lại batch đã applied.
5. Audit GoldenFarm/Berino read-only trước.
6. Xác định đúng 2 SKU thiếu vị.
7. Tạo correction batch riêng, không sửa trực tiếp manifest lịch sử nếu thay đổi đã production.
8. Append dòng chưa chắc vào backlog chung.
9. Mọi production correction phải có backup, dry-run, verify và rollback gate.
10. Không đụng app khác trên VPS.

## 11. Trạng thái chốt tại thời điểm bàn giao

- `main` đã chứa PR #112 qua commit `b2bcf6a5992f8b21e9a2f80beadfa9b29426c755`.
- Đường đen Batch 01: production verified.
- Trân châu Batch 01: dry-run verified, PR merged, production authorization đã có, **production final chưa được xác nhận trong chat**.
- GoldenFarm/Gold/Berino: có nghi vấn tên thương hiệu và 2 SKU thiếu vị; chưa sửa, chưa được phép suy đoán.
- Production confirmed canonical total: **146** trước khi xác nhận Trân châu Batch 01.

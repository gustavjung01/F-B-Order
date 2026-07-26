# Bàn giao Catalog Remap — Bếp Sỉ

> Cập nhật: 2026-07-26  
> Mục đích: bàn giao đầy đủ cho một chat/agent mới tiếp tục công việc mà không phải suy đoán lại trạng thái dự án.

---

## 0. Đọc phần này trước khi làm bất cứ thao tác nào

Đây là dự án **Bếp Sỉ** trong repository:

`gustavjung01/F-B-Order`

Nguyên tắc bắt buộc:

1. Không ghi production khi chưa có dry-run `PASS` và quyền production đúng phạm vi.
2. Không đụng các ứng dụng/backend khác cùng VPS.
3. Không commit private payload, giá thương mại, báo cáo production đầy đủ, SSH key hoặc secret.
4. Không ghi/xóa R2 trong giai đoạn catalog remap hiện tại.
5. Không tự “chuẩn hóa” tên thương hiệu, spelling hoặc quy cách khi nguồn còn mâu thuẫn.
6. Dòng chắc chắn map trước; dòng nghi ngờ chỉ append vào backlog chung.
7. Không tạo file note/Excel rời cho các dòng hold.
8. API catalog v2 khi kiểm sản phẩm phải dùng **variant UUID**, không dùng product UUID.
9. Production apply dùng engine xác nhận legacy:

   `--confirm-production=BEPSI_TEA_48`

10. Một câu như “tiếp”, “làm tiếp” hoặc “ok” không phải quyền production cho batch mới.

---

## 1. Biên giới hệ thống production

Chỉ thao tác Bếp Sỉ:

- Root: `/srv/apps/bepsi`
- Releases: `/srv/apps/bepsi/releases/<commit>`
- Current: `/srv/apps/bepsi/current`
- Env: `/etc/app-env/bepsi.env`
- API service: `bepsi-api.service`
- AI worker: `bepsi-ai-worker.service`
- API port: `5100`

VPS có nhiều website/backend. Tuyệt đối không dùng lệnh mơ hồ kiểu restart toàn bộ PM2, kill theo tên chung, đổi Nginx chung, xóa thư mục `/srv/apps/*`, hoặc thao tác database/app khác.

SSH key là file local-only. Không ghi đường dẫn key vào repository công khai và không commit key.

Workspace Windows đang dùng trong phiên trước:

`F:\1_A_Disk_D\thao-dev\thao-gateway\workspaces\F-B-Order`

Trước khi làm tiếp luôn chạy:

```powershell
git status -sb
git fetch origin
git switch main
git pull --ff-only origin main
git log -1 --oneline
```

Nếu working tree bẩn, phải đọc và hiểu file thay đổi trước; không `reset --hard`, không `clean -fd` tùy tiện.

---

## 2. Chính sách mapping catalog đã chốt

### 2.1 Dữ liệu sạch

- REMAP giữ `variantId` cũ.
- CREATE_NEW chỉ dùng khi chắc chắn không có legacy variant phù hợp.
- Giá thùng phải bằng giá đơn vị × số lượng đóng gói.
- Quy cách public manifest phải khớp private payload.
- Canonical SKU và legacy SKU phải duy nhất trong batch.

### 2.2 Dữ liệu nghi ngờ

Append vào duy nhất:

`data/catalog-remap/catalog-normalization-backlog.csv`

Backlog:

- Không chứa giá private.
- Không tạo note phụ.
- Không tạo Excel phụ.
- Chỉ review một lần sau khi map hết catalog.

Sau PR #112, backlog dự kiến có **51 data rows + header**. Phải kiểm lại bằng script/CSV parser trước khi dựa vào con số này.

### 2.3 Hình ảnh

- Ảnh xử lý sau khi toàn bộ catalog group đã được verify.
- Tên file mục tiêu: lowercase canonical SKU + `.webp`.
- Cho phép SKU remap chưa có ảnh.
- Không tạo ảnh AI trong batch remap.
- Không ghi/xóa R2 trong batch hiện tại.

---

## 3. Các batch đã xác nhận production

Các batch dưới đây đã có output production verify trong phiên trước.

| Batch | SKU | REMAP | CREATE_NEW | Trạng thái |
|---|---:|---:|---:|---|
| TEA-48 | 48 | 27 | 21 | Production verified |
| SIRO-BATCH-01 | 39 | 4 | 35 | Production verified |
| SIRO-BATCH-02 | 30 | 1 | 29 | Production verified |
| SINH-TO-MUT-BATCH-01 | 23 | 22 | 1 | Production verified |
| DUONG-DEN-BATCH-01 | 6 | 5 | 1 | Production verified |

Tổng canonical SKU đã xác nhận production đến hết Đường đen:

**146 SKU**

Không cộng Trân châu vào con số này cho đến khi có output production verify thật.

---

## 4. Đường đen Batch 01 — đã hoàn tất production

### 4.1 Git

- PR: `#111`
- Merge commit: `6ba161f209f9e88c3302bb14c01c2f796e0b5a64`

### 4.2 Scope

- 6 SKU
- 5 REMAP
- 1 CREATE_NEW
- 5 parent

Mappings:

| Legacy | Canonical | Tên |
|---|---|---|
| BGKQ-0054 | DDSEUL | ĐƯỜNG ĐEN MONITA |
| BGKQ-0055 | DNSEUL | ĐƯỜNG NÂU MONITA |
| BGKQ-0056 | DDDLTB | ĐƯỜNG ĐEN ĐÀI LOAN |
| BGKQ-0057 | DDMOLA | ĐƯỜNG ĐEN MOLA |
| — | SRDDER | ĐƯỜNG ĐEN ERODELI |
| BGKQ-0069 | TCDDGU | TC GIA UY ĐƯỜNG ĐEN |

### 4.3 Safety quan trọng

`TCDDGU` trước đó nằm chung parent “Trân châu Gia Uy”. Batch đã tách đúng riêng variant này sang:

`duong-den-gia-uy`

Các variant trân châu Gia Uy khác được hậu kiểm giữ nguyên parent.

### 4.4 Output production đã xác nhận

```text
DUONG_DEN_BATCH_01_PRODUCTION_VERIFIED
canonicalVariants             : 6
remapAliases                  : 5
createNew                     : 1
measured                      : 6
countOnly                     : 0
activeParents                 : 5
apiProductsVerified           : 5
recipeMismatchCount           : 0
giaUySiblingVariantsPreserved : True
```

Backup đã tạo:

`/srv/apps/bepsi/backups/catalog-remap/bepsi-before-duong-den-6-20260726T092049Z.dump`

Local final report:

`artifacts/catalog-remap/production/duong-den-batch-01-final.json`

### 4.5 Hold rows đã append backlog

- `BLAK1L`: tên 1L nhưng nguồn 1300 g/bình
- `BLAK2L`: tên 2L nhưng nguồn 2 kg/bình
- `SRDDFL`: nguồn 0 g/bình

---

## 5. Trân châu Batch 01 — trạng thái hiện tại rất quan trọng

### 5.1 Git và CI

- PR: `#112`
- PR đã squash merge vào `main`
- Merge commit: `b2bcf6a5992f8b21e9a2f80beadfa9b29426c755`
- Head đã dry-run: `d5622c3ced5d5ac0a351d0ae38dfef0136b65a35`
- CI trên head: 4/4 success
  - Migration CI
  - Recipe Version analysis
  - Catalog boundary
  - Core order contract

### 5.2 Public files

- `data/catalog-remap/tran-chau-batch-01.json`
- `data/catalog-remap/tran-chau-batch-01-plan.json`
- `data/catalog-remap/tran-chau-batch-01-review.csv`
- `data/catalog-remap/tran-chau-batch-01-contract-verification.json`
- `docs/catalog-remap-tran-chau-batch-01.md`
- backlog chung được append 1 row

### 5.3 Scope

- 4 REMAP
- 0 CREATE_NEW
- 2 parent
- Gia Uy: 3 SKU
- Kunhan: 1 SKU

Mappings:

| Legacy | Canonical | Tên | Parent |
|---|---|---|---|
| BGKQ-0068 | TCMNGU | TC GIA UY MINI | tran-chau-gia-uy |
| BGKQ-0070 | TCTRGU | TC GIA UY TRẮNG | tran-chau-gia-uy |
| BGKQ-0071 | TCCFGU | TC GIA UY CAFE | tran-chau-gia-uy |
| BGKQ-0073 | KH2KDD | TCĐĐ KUNHAN 2KG | tran-chau-kunhan |

Quy cách cả 4 dòng là measured, 2000 g, 10 đơn vị/thùng.

### 5.4 Hash đã chốt

- Manifest hash:

  `2a7998459e7a8c2fe3b703434bb664fba337c21a0236e65d5582c9ec2b446e6c`

- Private payload canonical hash:

  `781a52a2a46c001f8cd4b14f7270a3e19ede0cf5a0009eeb2df9fb077b3bc6a1`

- Hash profile: `standard`

Private payload cũ có hash khác nhưng file đối chứng không còn. Nó đã bị loại bỏ. Không được phục hồi hoặc dùng lại hash cũ.

### 5.5 Dry-run đã xác nhận

```text
TRAN_CHAU_BATCH_01_DRY_RUN_VERIFIED
Rows:    4
Pass:    4
Blocked: 0
```

Report local:

`artifacts/catalog-remap/production/tran-chau-batch-01-dry-run.json`

### 5.6 Production authorization

Project owner đã gửi đúng câu:

`CHO PHÉP merge PR #112 và apply production TRAN-CHAU-BATCH-01 gồm 4 SKU trên backend Bếp Sỉ`

Quyền này chỉ hợp lệ cho đúng:

- PR #112
- merge commit nêu trên
- 4 SKU nêu trên
- backend Bếp Sỉ
- không thêm/bớt/sửa scope

Nếu manifest, payload, mapping, parent hoặc số SKU thay đổi thì phải xin quyền production mới.

### 5.7 Trạng thái production hiện tại

**CHƯA ĐƯỢC XÁC NHẬN.**

Trong chat trước đã tạo file local-only:

`apply-tran-chau-batch-01.ps1`

Nhưng người dùng chưa gửi output chạy production trước khi chuyển chủ đề. Vì vậy không được tuyên bố Trân châu đã lên production.

Việc đầu tiên của chat mới:

1. Hỏi người dùng đã chạy file trên chưa.
2. Nếu có, yêu cầu dán đoạn cuối terminal hoặc đọc final report.
3. Nếu không có output, thực hiện read-only DB check task `TRAN-CHAU-BATCH-01` trước.
4. Không chạy lại apply mù nếu batch có thể đã applied.

Expected final output nếu thành công:

```text
TRAN_CHAU_BATCH_01_PRODUCTION_VERIFIED
Canonical variants: 4
Remap aliases:      4
CREATE_NEW:         0
Measured:           4
API products:       2
TCDDGU parent:      preserved
BGKQ-0067 Douxian:  preserved
```

Production gate bắt buộc bảo vệ:

- `TCDDGU` vẫn ở `duong-den-gia-uy`.
- `BGKQ-0067` Douxian giữ nguyên variant ID, product ID và parent.
- Không restart service.
- Không R2 write.
- Backup PostgreSQL phải tồn tại, có size > 0 và `pg_restore -l` đọc được.
- Nếu hậu kiểm lỗi phải rollback batch tự động.

### 5.8 Hold row Trân châu

`KH3KHK` bị hold vì:

- Tên bảng quán ghi Duoxian.
- Tên chuẩn hóa ghi Kunhan.
- Candidate legacy `BGKQ-0067` cũng là Douxian.

Không remap `BGKQ-0067` khi chưa xác nhận thương hiệu thật.

---

## 6. Vấn đề mới phát hiện: GoldenFarm / Gold / Berino

Đây là issue đang mở, chưa được sửa.

### 6.1 Người dùng phản hồi

Người dùng nói:

- Mã đang gọi là “Mama Gold” có lẽ thực tế là **GoldenFarm**.
- Hai mã đang bị thiếu phần **vị**.

Không được tự kết luận hai mã cụ thể là mã nào vì người dùng chưa nêu SKU trong đoạn chat cuối.

### 6.2 Dữ liệu hiện có trong manifest production

File cần audit:

`data/catalog-remap/sinh-to-mut-batch-01.json`

Target parent hiện tại:

```json
{
  "Gold": {
    "productKey": "mut-gold",
    "name": "Mứt Gold",
    "brand": "Gold"
  }
}
```

Manifest không ghi “Mama Gold” trong parent này. Nếu app đang hiện “Mama Gold”, nguồn sai có thể nằm ở:

- dữ liệu production cũ,
- API mapper,
- seed/catalog fixture,
- product name đã tồn tại trước remap,
- frontend display fallback,
- hoặc một parent khác đang bị dùng nhầm.

Không được sửa manifest dựa trên phỏng đoán. Phải audit DB/API và nguồn Excel.

### 6.3 Các SKU Gold hiện đã map

Tất cả đang ghi 1300 g/chai, 12 chai/thùng:

| SKU | Tên hiện tại | Vị |
|---|---|---|
| STGDAU | MỨT GOLD DÂU | dâu |
| STGDAO | MỨT GOLD ĐÀO | đào |
| STGVQU | MỨT GOLD VIỆT QUỐC | việt quốc |
| STGCDA | MỨT GOLD CHANH DÂY | chanh dây |
| STGKWI | MỨT GOLD KIWI | kiwi |
| STGXOA | MỨT GOLD XOÀI | xoài |
| STGOIH | MỨT GOLD ỔI | ổi |
| STGDTM | MỨT GOLD DÂU TẰM | dâu tằm |
| STGMCA | MỨT GOLD MÃNG CẦU | mãng cầu |
| STGVAI | MỨT GOLD VẢI | vải |
| STGNHO | MỨT GOLD NHO | nho |

`STGPBT` bị hold vì nguồn ghi 0 g/chai.

### 6.4 Các SKU Berino hiện đã map

Tất cả đang ghi 1350 g/chai, 12 chai/thùng:

| SKU | Tên hiện tại | Vị |
|---|---|---|
| BERDAU | BERINO DÂU | dâu |
| BERDAO | BERINO ĐÀO | đào |
| BEROIH | BERINO ỔI | ổi |
| BERVQU | BERINO VIỆT QUỐC | việt quốc |
| BERCDA | BERINO CHANH DÂY | chanh dây |
| BERVAI | BERINO VẢI | vải |
| BERPBT | BERINO PHÚC BỒN TỬ | phúc bồn tử |
| BERXOA | BERINO XOÀI | xoài |
| BERNHO | BERINO NHO | nho |
| BERDTM | BERINO DÂU TẰM | dâu tằm |
| BERTHM | BERINO THƠM | thơm |
| BERMCA | BERINO MÃNG CẦU | mãng cầu |

`BERKWI` bị hold vì nguồn ghi 13 g/chai.

### 6.5 Sai sót trong trả lời trước

Đã từng trả lời nhầm rằng 1350 g và 1300 g là “dung tích”. Đây là sai thuật ngữ.

- `g` là khối lượng tịnh.
- Không được tự đổi sang ml hoặc lít.
- Chỉ ghi dung tích khi nguồn/nhãn có dữ liệu thể tích chắc chắn.

Một câu trả lời tiếp theo còn suy đoán Berino 1L và Mama Gold mà chưa có đủ chứng cứ trong file đang mở. Không được dùng suy đoán đó làm dữ liệu chuẩn.

### 6.6 Quy trình audit bắt buộc

Chat mới phải làm theo thứ tự:

1. Đọc `data/catalog-remap/sinh-to-mut-batch-01.json`.
2. Đọc review CSV, contract verification và backlog.
3. Đối chiếu file nguồn Excel thương mại gốc.
4. Query production read-only theo các canonical SKU.
5. Lấy `variant UUID` của từng SKU cần kiểm.
6. Gọi API:

   `/api/catalog-v2/products/:variantUuid`

7. So sánh:
   - product name,
   - brand,
   - productKey,
   - variant name,
   - `options.type`,
   - size/weight,
   - package,
   - danh sách variants trong parent.
8. Xác định chính xác hai SKU bị thiếu vị.
9. Xác nhận bằng nguồn/nhãn xem thương hiệu đúng là GoldenFarm, Gold hay Mama Gold.
10. Chỉ sau khi có bằng chứng mới tạo correction branch/PR.

### 6.7 Cách sửa đúng

Không được sửa lịch sử batch cũ im lặng.

Nếu production đã sai:

- Tạo correction plan/batch riêng, reversible.
- Ghi rõ before-state và expected after-state.
- Bảo vệ variant IDs và alias history.
- Dry-run read-only.
- CI pass.
- Xin production approval riêng.
- Backup + apply + DB/API verify + rollback gate.

Nếu chỉ frontend hiển thị sai còn DB đúng:

- Tạo PR code riêng.
- Không chạy catalog remap production.

---

## 7. Nguồn file đã dùng

Nguồn mapping bổ sung trong phiên:

`BANG_GIA_KENH_QUAN_MAP_APP_BO_SUNG.xlsx`

Tên file trước đó:

- `BẢNG GIÁ KÊNH QUÁN.xlsx`
- `Giá Thùng.xlsx`

Các file nguồn/private không được commit nếu chứa giá hoặc dữ liệu thương mại riêng.

---

## 8. Hạ tầng catalog-remap trong repo

Engine chính:

- `apps/backend/scripts/catalog-remap-batch-engine.mjs`
- `apps/backend/scripts/catalog-remap-batch-common.mjs`
- `apps/backend/scripts/catalog-remap-batch-state.mjs`
- `apps/backend/scripts/catalog-remap-batch-apply.mjs`
- `apps/backend/scripts/catalog-remap-batch-verify.mjs`

Dry-run plan wrapper:

`apps/backend/scripts/run-catalog-remap-plan-dry-run-vps-root.mjs`

Migrations bắt buộc:

- `db/migrations/031_catalog_group_remap.sql`
- `db/migrations/032_catalog_packaging_count_only.sql`

Không tự sửa migration cũ đã chạy production để giải quyết correction mới.

---

## 9. Trạng thái và field verify của engine

### Dry-run

Plan wrapper kỳ vọng:

- `CATALOG_REMAP_PLAN_DRY_RUN_PASS`
- batch `BATCH_DRY_RUN_PASS`
- rows = pass
- blocked = 0

Engine nội bộ có thể ghi legacy status:

`TEA_PRODUCTION_DRY_RUN_PASS`

### Apply

Engine apply pass:

`TEA_PRODUCTION_APPLY_PASS`

Các field verify cần đọc:

- `canonicalVariantCount`
- `remapAliasCount`
- `createNewCount`
- `measuredCount`
- `countOnlyCount`
- `recipeMismatchCount`
- `activeParentCount`
- `rollbackBatchIds`

Không chỉ nhìn exit code; phải đọc report JSON và DB/API hậu kiểm.

### Rollback

Engine rollback sẽ từ chối nếu:

- after-state đã bị thay đổi ngoài batch,
- có dependent batch chạy sau,
- hoặc dữ liệu không còn khớp snapshot.

Do đó không thao tác thủ công vào các variant vừa remap trước khi cần rollback.

---

## 10. Checklist production chuẩn

Mỗi batch production phải có:

1. PR merge đúng expected head SHA.
2. Local main chứa merge commit.
3. Private payload nằm trong gitignore.
4. Payload hash hợp lệ.
5. Self-test PASS.
6. VPS boundary đúng `/srv/apps/bepsi`.
7. Chỉ service Bếp Sỉ active.
8. Port 5100 listening.
9. Health endpoint PASS.
10. Migration 031/032 tồn tại.
11. Batch chưa applied.
12. Fresh PostgreSQL 17 backup.
13. Backup size > 0.
14. `pg_restore -l` PASS.
15. Fresh production dry-run PASS.
16. Apply đúng confirmation token.
17. Engine verification PASS.
18. DB row counts PASS.
19. API verify bằng variant UUID.
20. Non-target siblings/parents được bảo vệ.
21. Service/worker vẫn active.
22. Không restart service nếu không cần.
23. Không R2 writes.
24. Nếu hậu kiểm lỗi: automatic rollback.
25. Tải final report về local.

---

## 11. Thứ tự công việc cho chat mới

### Việc 1 — xác định Trân châu đã apply hay chưa

Không đoán.

- Hỏi user có chạy `apply-tran-chau-batch-01.ps1` chưa.
- Kiểm local report nếu có:

  `artifacts/catalog-remap/production/tran-chau-batch-01-final.json`

- Nếu report tồn tại, status phải là:

  `TRAN_CHAU_BATCH_01_PRODUCTION_VERIFIED`

- Nếu report không có, query DB read-only xem task đã applied chưa.
- Chỉ apply khi chắc chắn chưa applied.

### Việc 2 — audit GoldenFarm / Gold / Berino

- Xác định đúng thương hiệu.
- Xác định chính xác hai SKU thiếu vị.
- Phân biệt lỗi DB/catalog hay lỗi frontend display.
- Không sửa production khi chưa có correction plan và approval.

### Việc 3 — tiếp tục catalog group kế tiếp

Sau khi Trân châu và correction audit được chốt:

- Xác định group kế tiếp từ source theo thứ tự.
- Map phần sạch.
- Append hold vào backlog chung.
- Static contract.
- Draft PR.
- CI.
- Dry-run.
- Production approval riêng.

Không tự đoán group tiếp theo chỉ dựa vào số dòng.

---

## 12. Cách giao tiếp với project owner

- Nói thẳng trạng thái PASS/FAIL/BLOCKED.
- Không nói “đã xong production” nếu chưa có output thật.
- Không đưa block PowerShell khổng lồ nếu có thể đóng gói `.ps1` một dòng chạy.
- Nếu terminal hiện `>>`, hướng dẫn `Ctrl+C`.
- Khi cần production approval, đưa đúng một câu scope rõ ràng.
- Không tự động mở rộng scope.
- Không sửa spelling nguồn như `VIỆT QUỐC` nếu chưa có quyết định chuẩn hóa.

---

## 13. Tóm tắt một dòng

Production đã xác nhận đến **146 canonical SKU**; PR #112 Trân châu đã merge và dry-run 4/4 nhưng production **chưa có output xác nhận**; việc ưu tiên tiếp theo là xác định trạng thái apply Trân châu rồi audit lỗi thương hiệu **GoldenFarm/Gold** và hai SKU bị thiếu vị mà không sửa mò.

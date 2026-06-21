# Phase 7 — Test tổng và deploy production

Phase này là cổng duy nhất được phép:

- kích hoạt Vercel Production;
- pull source trên VPS;
- chạy migration production;
- import catalog production;
- restart backend Bếp Sỉ.

Không workflow hoặc script nào trong Phase 7 được phép tác động VLGN hoặc Tóc Việt.

## Phạm vi production cố định

| Thành phần | Giá trị |
|---|---|
| Repository | `gustavjung01/F-B-Order` |
| VPS user/host | `ubuntu@40.233.83.234` |
| Source | `/srv/apps/bepsi/source` |
| Current release | `/srv/apps/bepsi/current` |
| Releases | `/srv/apps/bepsi/releases` |
| Backups | `/srv/apps/bepsi/backups` |
| Environment | `/etc/app-env/bepsi.env` |
| Systemd service | `bepsi-api.service` |
| Backend URL | `https://api.bepsi.click` |
| Frontend URL | `https://bepsi.click` |

Các path/service sau nằm ngoài phạm vi và tuyệt đối không được chạm:

- `/srv/apps/vlgn`;
- `/srv/apps/tocviet`;
- `vlgn-api.service`;
- `tocviet-api.service`;
- mọi lệnh restart diện rộng như `pm2 restart all` hoặc `systemctl restart` không kèm đúng `bepsi-api.service`.

## Workflow production

File:

```text
.github/workflows/phase7-production-deploy.yml
```

Workflow chỉ chạy bằng `workflow_dispatch`. Không chạy khi push hoặc merge.

Input bắt buộc:

```text
target_sha=<full 40-character SHA from main>
confirmation=DEPLOY_BEPSI_PRODUCTION
```

Workflow dùng concurrency lock `bepsi-production-deploy`, vì vậy không có hai production deployment chạy đồng thời.

## GitHub environment và secrets

Tạo GitHub Environment tên `production` và bật required reviewer.

Secrets bắt buộc:

| Secret | Nội dung |
|---|---|
| `BEPSI_VPS_SSH_KEY` | Nội dung private key SSH dành cho Bếp Sỉ |
| `BEPSI_VPS_KNOWN_HOSTS` | Dòng known-host đã xác minh cho `40.233.83.234` |
| `VERCEL_TOKEN` | Token deploy Vercel |
| `VERCEL_ORG_ID` | Vercel organization/team ID |
| `VERCEL_PROJECT_ID` | Vercel project ID của frontend Bếp Sỉ |
| `PHASE7_APPROVED_CUSTOMER_TOKEN` | Clerk bearer token của customer production đã approved |
| `PHASE7_ADMIN_TOKEN` | Clerk bearer token của admin production |
| `PHASE7_SMOKE_PRODUCT_ID` | UUID product production đang active, orderable và có giá |

Environment variable:

| Variable | Nội dung |
|---|---|
| `PHASE7_SMOKE_QUANTITY` | Số lượng test; script tự nâng lên `minOrderQty` nếu thấp hơn |

Không commit bất kỳ secret hoặc database URL nào vào repository.

## Vercel production variables

Trước khi chạy workflow, Vercel Production phải có đúng:

```env
NEXT_PUBLIC_DATA_MODE=backend
BACKEND_API_URL=https://api.bepsi.click
NEXT_PUBLIC_API_URL=https://api.bepsi.click
```

Script deploy sẽ pull production environment và dừng ngay nếu ba giá trị trên không đúng. Nó không tự fallback hoặc tự sửa âm thầm.

Các Clerk/OneSignal variables production hiện hữu vẫn phải được giữ nguyên.

## Thứ tự gate

### 1. Total system gate

Workflow chạy trên PostgreSQL 16 tạm:

1. xác minh SHA thuộc `main`;
2. install bằng lockfile;
3. typecheck toàn monorepo;
4. build backend;
5. migrate fresh database;
6. seed compatibility fixture;
7. chạy migration lần hai;
8. verify core order contract;
9. verify approval pricing;
10. import catalog;
11. verify catalog contract;
12. verify order engine;
13. verify admin operations;
14. verify frontend/backend cutover.

Bất kỳ bước nào fail thì production không chạy.

### 2. Backend production

Workflow SSH đúng `ubuntu@40.233.83.234`, sau đó:

1. vào `/srv/apps/bepsi/source`;
2. `git switch main`;
3. `git pull --ff-only origin main`;
4. xác minh HEAD đúng `target_sha`;
5. khóa deploy bằng `flock`;
6. xác minh remote repository;
7. xác minh `bepsi-api.service` chạy từ `/srv/apps/bepsi/current`;
8. tạo `pg_dump` production;
9. tạo immutable release directory;
10. install và build backend;
11. audit schema trước migration;
12. chạy migration ledger;
13. import catalog trong transaction;
14. audit schema sau import;
15. chuyển symlink `current`;
16. restart riêng `bepsi-api.service`;
17. smoke health, version, categories và products.

Migration và catalog import xảy ra trước khi đổi symlink runtime.

### 3. Vercel Production

Chỉ chạy khi backend production PASS:

1. checkout đúng SHA;
2. pull Vercel Production settings;
3. xác minh mode và API URL;
4. Vercel production build;
5. deploy prebuilt artifact bằng `--prod`.

### 4. Production smoke

Sau Vercel deploy:

1. backend health PASS;
2. backend version bằng `frontend-cutover-v6`;
3. anonymous catalog không lộ `amount`;
4. frontend catalog proxy trả backend payload;
5. frontend `/api/auth/me` trả `AUTH_REQUIRED` khi chưa đăng nhập, xác nhận đang chạy backend mode;
6. approved customer thấy giá và có quyền order;
7. cart backend validate PASS;
8. tạo một production smoke order với idempotency key;
9. backend trả order ID;
10. admin API nhìn thấy ngay đúng order ID.

Smoke order là order thật. Sau workflow, admin phải xử lý hoặc hủy order theo quy trình vận hành.

## Backup và rollback

Trước migration, script tạo:

```text
/srv/apps/bepsi/backups/bepsi-<timestamp>-<sha>.dump
/srv/apps/bepsi/backups/schema-before-<timestamp>-<sha>.json
/srv/apps/bepsi/backups/schema-after-<timestamp>-<sha>.json
```

Nếu service restart hoặc backend smoke fail sau khi đổi release:

- symlink `current` tự quay về release trước;
- chỉ `bepsi-api.service` được restart lại;
- release lỗi vẫn được giữ để điều tra.

Database migration là forward-only. Script không tự chạy down migration. Nếu cần restore database, phải dừng deployment và thực hiện theo quyết định vận hành riêng từ file `pg_dump`.

Nếu backend đã PASS nhưng Vercel fail:

- backend mới vẫn giữ nguyên;
- frontend production cũ vẫn hoạt động;
- sửa Vercel config/build rồi chạy lại cùng SHA.

Nếu Vercel PASS nhưng authenticated smoke fail:

- không tuyên bố production PASS;
- kiểm tra customer token, admin token, product orderability và Clerk mapping;
- dùng cùng SHA để rerun sau khi xử lý nguyên nhân;
- không fallback frontend về static mode để che lỗi backend.

## Chạy workflow

Vào GitHub Actions:

```text
Phase 7 production deploy
→ Run workflow
→ target_sha: SHA đầy đủ trên main
→ confirmation: DEPLOY_BEPSI_PRODUCTION
```

Chỉ chạy sau khi GitHub Environment `production` đã có đầy đủ secrets, reviewer và Vercel variables.

## Kiểm tra thủ công sau PASS

- mở `https://bepsi.click/products` trên mobile và desktop;
- đăng nhập customer pending: không thấy giá, không đặt được;
- đăng nhập customer approved: thấy đúng giá backend;
- mở cart, xác minh preview backend;
- kiểm tra smoke order trong `/admin`;
- xác nhận `https://api.bepsi.click/api/version` trả `frontend-cutover-v6`;
- xác nhận không có service VLGN/Tóc Việt bị restart.

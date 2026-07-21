# PLAN SỬA SAU AUDIT — F-B-ORDER

Ngày lập: 2026-07-21

## 1. Nguồn code chuẩn đã xác nhận

- GitHub: `https://github.com/gustavjung01/F-B-Order.git`
- Nhánh chuẩn để đối chiếu: `main`
- Commit đã audit: `f2d3cdb388054d634264d01a9761c96839773c58`
- Workspace local và `origin/main` đang cùng commit trên.
- Repo workspace trỏ đúng GitHub của dự án.

Kết luận: các lỗi trong plan này tồn tại trên đúng bản `main` hiện tại, không phải audit nhầm repo hoặc nhầm nhánh.

## 2. Tình trạng nhánh và pull request

- Repo có khoảng 37 nhánh remote, gồm `main` và nhiều nhánh `agent/*`, `feat/*`, `fix/*`, `test/*`, `ai/*`, `chore/*`.
- GitHub đang có 20 pull request mở.
- Phần lớn pull request mở là draft từ tháng 6/2026 và đã cũ hơn nhiều thay đổi đang có trên `main`.
- Các nhánh mới đã merge vào `main` gần nhất gồm nhóm PR #80 đến #85, nhưng nhánh remote vẫn chưa được xóa hết.

### Quy tắc xử lý nhánh

1. Chỉ lấy `main` làm nguồn code production.
2. Không merge hàng loạt các PR hoặc nhánh cũ.
3. Với từng PR đang mở phải chọn một trong ba cách:
   - Còn cần: rebase lên `main`, chạy lại test rồi review.
   - Chức năng đã có trên `main`: đóng PR và xóa nhánh.
   - Không còn đúng hướng dự án: đóng PR, không cherry-pick.
4. Các nhánh đã merge phải xóa sau khi xác nhận commit đã nằm trong `main`.
5. Nhánh `tmp-check` và `chore/write-permission-test-20260718` cần ưu tiên kiểm tra để xóa nếu chỉ là nhánh thử nghiệm.

## 3. Việc P0 — sửa ngay trước mọi tính năng mới

### P0.1 Sửa lỗi transaction cập nhật ảnh sản phẩm

Vấn đề dễ hiểu: lúc cập nhật ảnh, hệ thống có thể xóa ảnh cũ rồi lỗi giữa chừng nhưng không khôi phục đúng dữ liệu.

File hiện tại:

- `apps/frontend/app/api/admin/product-images/route.ts`
- `apps/frontend/lib/db.ts`

Cách làm:

1. Bản vá an toàn trước mắt: dùng `const client = await db.connect()`.
2. Mọi câu `BEGIN`, `UPDATE`, `DELETE`, `INSERT`, `COMMIT`, `ROLLBACK` phải chạy bằng cùng biến `client`.
3. Luôn `client.release()` trong `finally`.
4. Viết test cho hai trường hợp:
   - Cập nhật ảnh thành công.
   - Cố tình làm một lệnh insert lỗi và xác nhận ảnh cũ không bị mất.
5. Sau khi bản vá chạy ổn, chuyển toàn bộ API ảnh sản phẩm sang backend Express.

Điều kiện hoàn thành:

- Không còn dùng `Pool.query("BEGIN")` trong route.
- Test rollback thành công.
- Không mất ảnh nếu một bước cập nhật thất bại.

### P0.2 Gom quyền admin về một nơi

Vấn đề dễ hiểu: frontend và backend đang dùng hai cách khác nhau để quyết định ai là admin.

File liên quan:

- `apps/frontend/lib/admin.ts`
- `apps/frontend/app/api/admin/product-images/route.ts`
- `apps/backend/src/modules/admin/admin-access.ts`
- `apps/backend/src/modules/auth/auth.identity.ts`

Cách làm:

1. Backend là nơi duy nhất quyết định quyền admin.
2. Backend phải kiểm tra người dùng tồn tại trong `staff_users`, đúng role và đang active.
3. Frontend chỉ gọi backend, không tự cấp quyền ghi dữ liệu bằng `ADMIN_EMAILS`.
4. `ADMIN_EMAILS` chỉ được dùng cho tình huống khẩn cấp có ghi rõ, hoặc xóa hẳn khỏi luồng production.
5. Thêm test: admin đã bị khóa phải nhận 403 khi gọi API ghi dữ liệu.

Điều kiện hoàn thành:

- Không còn API ghi database dựa riêng vào danh sách email frontend.
- Khóa staff trong database có hiệu lực ngay.
- Mọi API admin trả 401/403 thống nhất.

### P0.3 Chặn khách bị khóa xem giá sỉ

Vấn đề dễ hiểu: khách từng được duyệt nhưng sau đó bị khóa vẫn có thể dùng API frontend cũ để lấy giá sỉ.

File liên quan:

- `apps/frontend/app/api/products/[slug]/route.ts`
- `apps/backend/src/modules/auth/auth.routes.ts`
- Catalog API backend liên quan đến sản phẩm và giá.

Cách làm:

1. Ngừng dùng route frontend truy cập database trực tiếp để tính quyền xem giá.
2. Frontend lấy chi tiết sản phẩm từ backend Catalog API.
3. Backend chỉ trả giá sỉ khi:
   - `approval_status = approved`.
   - `account_status = active`.
   - Mapping customer/user hợp lệ.
4. Thêm test cho các trạng thái pending, rejected, inactive, blocked và active.

Điều kiện hoàn thành:

- Khách inactive hoặc blocked không lấy được giá sỉ.
- Logic giá chỉ nằm ở backend.
- Không còn hai đoạn code tự quyết định quyền xem giá.

## 4. Việc P1 — làm trước lần deploy production tiếp theo

### P1.1 Bỏ toàn bộ kết nối database trực tiếp từ frontend

Các route cần chuyển sang backend:

- `apps/frontend/app/api/admin/product-images/route.ts`
- `apps/frontend/app/api/categories/route.ts`
- `apps/frontend/app/api/customer-profile/route.ts`
- `apps/frontend/app/api/products/[slug]/route.ts`

Cách làm:

1. Tạo hoặc hoàn thiện endpoint tương ứng trong backend.
2. Frontend gọi endpoint backend bằng client/proxy thống nhất.
3. Xóa `apps/frontend/lib/db.ts` sau khi không còn nơi sử dụng.
4. Gỡ dependency `pg` khỏi frontend nếu không còn cần.
5. Thêm kiểm tra CI để chặn import `@/lib/db` trong frontend.

Điều kiện hoàn thành:

- Frontend không cần `DATABASE_URL`.
- Không có `new Pool()` trong frontend.
- README và code thực tế khớp nhau.

### P1.2 Khóa phiên bản dependency và sửa Docker build

File liên quan:

- `apps/backend/package.json`
- `apps/backend/Dockerfile`
- `pnpm-lock.yaml`

Cách làm:

1. Thay toàn bộ dependency `"latest"` bằng phiên bản cụ thể đã ghi trong lockfile.
2. Docker phải copy `pnpm-lock.yaml` và `pnpm-workspace.yaml` trước khi install.
3. Dùng `pnpm install --frozen-lockfile`.
4. Không dùng `--frozen-lockfile=false` trong production build.
5. Chạy build sạch hai lần và xác nhận kết quả giống nhau.

Điều kiện hoàn thành:

- Cùng một commit luôn cài cùng phiên bản thư viện.
- Docker build không tự nâng dependency.
- CI thất bại nếu package.json và lockfile lệch nhau.

### P1.3 Thêm lint và kiểm tra code thật

Vấn đề: script lint backend hiện chỉ in chữ và luôn báo thành công.

Cách làm:

1. Cài ESLint phù hợp với TypeScript backend.
2. Thay script lint giả bằng lệnh kiểm tra thật.
3. CI phải chạy tối thiểu:
   - `pnpm lint`
   - `pnpm typecheck`
   - test backend quan trọng
   - `pnpm build`
4. Không cho merge khi một bước thất bại.

Điều kiện hoàn thành:

- Cố tình tạo lỗi lint phải làm CI đỏ.
- TypeScript error phải chặn merge.

### P1.4 Sửa bảo mật kết nối PostgreSQL

File liên quan:

- `apps/frontend/lib/db.ts` trong thời gian chưa xóa.
- `apps/backend/src/db/pool.ts`.
- Các script migration/deploy kết nối database.

Cách làm:

1. Không mặc định `rejectUnauthorized: false` cho production.
2. Cấu hình CA certificate qua biến môi trường hoặc file secret.
3. Chỉ cho phép chế độ bỏ verify trong local/test khi có biến bật rõ ràng.
4. Ghi cấu hình mẫu vào `.env.example` và tài liệu deploy.

Điều kiện hoàn thành:

- Production xác minh chứng chỉ database.
- Local/test vẫn chạy được bằng cấu hình riêng.

### P1.5 Đồng bộ port và biến môi trường

File liên quan:

- `apps/backend/src/main.ts`
- `docker-compose.yml`
- Dockerfile và tài liệu local/deploy.

Cách làm:

1. Chốt một port backend, đề xuất `4000` cho Docker và production.
2. Khai báo `PORT=4000` rõ trong compose.
3. Healthcheck phải gọi đúng port.
4. Bổ sung `.env.example` đầy đủ nhưng không chứa secret.

Điều kiện hoàn thành:

- Container khởi động và healthcheck pass khi không có file `.env` cá nhân.
- Tài liệu và cấu hình dùng cùng port.

## 5. Việc P2 — dọn repo và vận hành

### P2.1 Dọn file build cache khỏi Git

File đang bị track:

- `apps/frontend/tsconfig.tsbuildinfo`

Cách làm:

```bash
printf '\n*.tsbuildinfo\n' >> .gitignore
git rm --cached apps/frontend/tsconfig.tsbuildinfo
```

Điều kiện hoàn thành:

- Build frontend không làm Git dirty.

### P2.2 Dọn migration cũ

Cách làm:

1. So sánh mọi file trong `db/migrations` với danh sách migration runner thực sự chạy.
2. Các file legacy không còn dùng phải chuyển sang `db/archive/legacy-migrations`.
3. Không xóa file migration đã chạy ở production.
4. Ghi rõ file nào active, file nào archive.

Điều kiện hoàn thành:

- Người vận hành không thể chạy nhầm migration cũ.
- Migration plan chỉ hiện đúng danh sách production.

### P2.3 Thêm chính sách giữ backup và release

Cách làm:

1. Giữ 10 release backend gần nhất.
2. Giữ backup database 30 ngày, hoặc theo chính sách được chốt.
3. Kiểm tra dung lượng ổ đĩa trước backup và build.
4. Không xóa release đang chạy và release rollback gần nhất.
5. Ghi log những file đã xóa.

Điều kiện hoàn thành:

- VPS không tăng dung lượng vô hạn sau mỗi lần deploy.
- Luôn còn ít nhất một bản rollback an toàn.

### P2.4 Dọn nhánh và pull request

Cách làm:

1. Xuất danh sách 20 PR mở.
2. Đánh dấu từng PR: `KEEP`, `REBASE`, `CLOSE`.
3. Đóng các draft đã bị `main` thay thế.
4. Xóa nhánh đã merge sau khi xác nhận commit nằm trong `main`.
5. Không xóa nhánh có thay đổi chưa được sao lưu hoặc chưa có quyết định rõ.

Điều kiện hoàn thành:

- Chỉ còn các PR thực sự đang làm.
- Không còn nhánh thử nghiệm hoặc nhánh đã merge gây nhầm lẫn.

## 6. Cách chia nhánh để sửa

Không sửa toàn bộ trong một commit lớn.

### Nhánh 1 — lỗi nghiêm trọng

Tên đề xuất:

`fix/audit-p0-data-access`

Phạm vi:

- Transaction ảnh sản phẩm.
- Quyền admin thống nhất.
- Chặn khách bị khóa xem giá sỉ.
- Test hồi quy cho ba lỗi trên.

### Nhánh 2 — kiến trúc và build

Tên đề xuất:

`refactor/backend-only-data-access`

Phạm vi:

- Chuyển Next API trực tiếp DB sang backend.
- Xóa DB client khỏi frontend.
- Pin dependency.
- Docker frozen lockfile.
- Lint thật và CI.

### Nhánh 3 — vận hành và dọn repo

Tên đề xuất:

`chore/repo-production-hardening`

Phạm vi:

- TLS database.
- Port và `.env.example`.
- Retention backup/release.
- `.tsbuildinfo`.
- Migration archive.
- Dọn branch/PR.

## 7. Trình tự kiểm tra trước merge

Chạy từ root repo:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Nếu repo chưa có `pnpm test` chung thì chạy các test backend được khai báo trong `apps/backend/package.json` và bổ sung script root sau.

Kiểm tra thủ công bắt buộc:

1. Admin active cập nhật ảnh được.
2. Cập nhật ảnh lỗi giữa chừng không làm mất ảnh cũ.
3. Admin bị khóa không sửa dữ liệu được.
4. Khách approved + active xem được giá sỉ.
5. Khách approved + blocked không xem được giá sỉ.
6. Frontend không kết nối thẳng database.
7. Backend healthcheck pass trong Docker.
8. Migration plan không có file lạ.

## 8. Cách đưa code về local hoặc VPS

### Local developer

Chỉ pull khi worktree sạch:

```bash
git switch main
git status
git fetch origin
git pull --ff-only origin main
pnpm install --frozen-lockfile
```

Nếu `git status` đang có file tự sửa thì commit, stash hoặc bỏ thay đổi trước. Không dùng `git pull` cưỡng ép đè file local.

### VPS production

Ưu tiên dùng workflow/deploy script hiện có thay vì SSH vào rồi pull tay trong thư mục đang chạy.

Trình tự chuẩn:

1. Merge PR đã pass CI vào `main`.
2. Workflow xác nhận đúng commit SHA của `main`.
3. Backup database.
4. Chạy migration plan và migration.
5. Tạo immutable release mới.
6. Chuyển symlink/current release.
7. Chạy healthcheck và smoke test.
8. Rollback release nếu smoke test thất bại.

Không pull code mới trực tiếp vào release đang chạy vì sẽ phá cơ chế rollback.

## 9. Thứ tự thực hiện chốt

1. Tạo nhánh `fix/audit-p0-data-access` từ `main` commit `f2d3cdb`.
2. Sửa ba lỗi P0 và test.
3. Merge P0 sau khi CI pass.
4. Pull `main` mới về local.
5. Deploy backend/Vercel theo workflow hiện tại.
6. Làm P1 trên nhánh riêng.
7. Làm P2 sau khi production đã ổn định.
8. Cuối cùng dọn 20 PR mở và các nhánh đã merge.

Không triển khai tính năng mới trước khi hoàn thành P0.

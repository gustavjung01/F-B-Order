# Sinh tố / Mứt Batch 01

## Mô hình thuộc tính bắt buộc

Không dùng một trường `type` để chứa lẫn mọi thông tin.

- Nhóm catalog: `Sinh tố / mứt`
- Thương hiệu: `Berino`, `Goldenfarm`
- Chủng loại SKU (`productType`): ví dụ `sinh-to`, `mut`
- Vị (`flavor`): ví dụ `dau`, `nho`, `kiwi`, `phuc-bon-tu`
- Kiểu định lượng (`measureKind`): `mass`, `volume` hoặc `count`
- Khối lượng chính: `netQuantity` + `netUnit` khi `measureKind=mass`
- Dung tích chính: `netQuantity` + `netUnit` khi `measureKind=volume`
- Dung tích phụ: `volumeQuantity` + `volumeUnit` khi nhãn đồng thời công bố khối lượng và dung tích
- Đơn vị bán và quy cách ngoài: `sellUnit`, `packageQuantity`, `packageUnit`

Quy tắc dùng chung nằm tại:

`data/catalog-remap/catalog-attribute-policy-v1.json`

Các nguyên tắc khóa:

1. `productType` không được chứa Dâu/Nho/Táo; đó là `flavor`.
2. Không đổi g/kg sang ml/l hoặc ngược lại.
3. Mỗi SKU được kiểm riêng; không tự sao chép thuộc tính từ SKU anh em.
4. Thiếu hoặc xung đột thì để trống/HOLD, không điền mò.
5. Một SKU có thể có cả khối lượng và dung tích; hai giá trị phải nằm ở hai trường riêng.

## Phạm vi hiện tại

- 25 SKU duy nhất
- 24 REMAP giữ variantId
- 1 CREATE_NEW: `BERMCA`
- Berino: 13 SKU
- Goldenfarm: 12 SKU

### Berino

- Thương hiệu: `Berino`
- `productType`: `sinh-to`
- `flavor`: tách riêng theo từng SKU
- `measureKind`: `mass`
- Khối lượng nguồn: 1350 g/chai
- Dung tích: chưa có dữ liệu chắc chắn trong nguồn đang dùng nên để trống

### Goldenfarm

- Thương hiệu: `Goldenfarm`
- `productType`: `mut`, dựa trên nhãn nguồn `MỨT GOLD`
- `flavor`: tách riêng theo từng SKU
- `measureKind`: `mass`
- Khối lượng nguồn: 1300 g/chai
- Dung tích: chưa có dữ liệu chắc chắn trong nguồn đang dùng nên để trống

Không dùng chữ `Gold` làm thương hiệu chuẩn. Internal key `mut-gold` chỉ được giữ để bảo toàn lịch sử remap và map ảnh; không phải metadata hiển thị.

## Hai vị đã khôi phục

- `BGKQ-0021` → `BERKWI`: Berino, chủng loại Sinh tố, vị Kiwi, 1350 g/chai, 12 chai/thùng
- `BGKQ-0032` → `STGPBT`: Goldenfarm, chủng loại Mứt, vị Phúc Bồn Tử, 1300 g/chai, 12 chai/thùng

Backlog vẫn giữ dấu vết mã cũ, lý do HOLD và kết quả xử lý để phục vụ audit, rollback và map ảnh sau.

## Engine

Engine catalog-remap đã được mở rộng theo cơ chế opt-in:

- Manifest mới khai báo `attributeModelVersion: 1`.
- `productType` được ghi vào `options.type` để giữ tương thích API/frontend hiện tại.
- `flavor` được ghi riêng vào `options.flavor`.
- `measureKind=mass` ghi `options.measure_kind=mass`, `options.weight` và chuỗi `options.size` tương thích.
- `measureKind=volume` ghi `options.measure_kind=volume`, `options.volume`, `options.capacity` và `options.size`.
- `measureKind=count` không tạo `size`.
- Batch lịch sử không khai báo `attributeModelVersion: 1` nên giữ nguyên hành vi cũ.
- Test engine đã bổ sung kiểm tra dry-run, apply, rollback, xóa giá trị cũ sai và bảo toàn batch legacy.

## Backlog chuẩn hóa chung

- Batch từng append 17 dòng vào `data/catalog-remap/catalog-normalization-backlog.csv`.
- Đã xử lý 2 dòng: `BERKWI`, `STGPBT`.
- Còn 15 dòng HOLD chưa giải quyết:
  - 11 SKU Vina 1L: tên 1L nhưng nguồn ghi 1300 g/chai.
  - 4 SKU Vina 650G: nguồn ghi 0 g/hũ.
- Backlog công khai không chứa giá private.

## Hash và payload private

- Manifest: `a09e9ec88984b55f637265313c8b18379881bec1ba653ed1ba0b7b35a571e553`
- Private payload vẫn là bản 23 SKU, hash cũ: `70b271a96bff58d159510ecaa47cae8f631e76a61f415561a5d64be23db191ab`
- Phải bổ sung hai dòng thương mại `BGKQ-0021/BERKWI` và `BGKQ-0032/STGPBT`, tính lại payload hash rồi chạy lại contract.

## Cổng an toàn

- Public manifest/review: đã tách riêng chủng loại, vị và kiểu định lượng cho 25 SKU.
- Engine code/test: đã cập nhật, đang chờ CI xác nhận PASS.
- Static contract: BLOCKED đến khi engine test PASS và private payload đủ 25 SKU.
- Database dry-run: chưa chạy.
- Production apply: chưa chạy.
- Không migration, restart service hoặc ghi/xóa R2.
# Siro Batch 01

- Task: `SIRO-BATCH-01`
- Phạm vi: 39 SKU
- Cấu trúc: 4 `REMAP` + 35 `CREATE_NEW`
- Nhãn hàng: Torani 14, DingFong 15, GTP 9, A+ 1
- Trạng thái hiện tại: static contract `PASS`; chưa chạy database dry-run; chưa apply production

## Quyết định mapping

| Nhãn hàng | Survivor legacy SKU | Canonical SKU giữ `variantId` | SKU mới |
|---|---|---|---:|
| Torani | `BGKQ-0001` | `TORDLU` | 13 |
| DingFong | `BGKQ-0003` | `DFGXOA` | 14 |
| GTP | `BGKQ-0006` | `GTPNHO` | 8 |
| A+ | `BGKQ-0053` | `SRADDE` | 0 |

`GTPMON` không nằm trong batch. Audit đánh dấu dòng này `BLOCKED` vì siro môn bị gợi ý sai sang sản phẩm bột môn GTP.

## Khóa dữ liệu

- Manifest hash: `4c14a0dde9dac363846b2925e5c9d88c4cd03fb83819b78f5b434f070f9d8111`
- Private payload hash: `b1c8cc67334df1f29597b7a015c5a4978b86338fd22505e04edb5fe13e3e86bf`
- 39 canonical SKU duy nhất
- 4 legacy SKU duy nhất
- Quy cách manifest khớp private commercial payload
- Giá thùng dẫn xuất bằng giá đơn vị nhân số lượng đóng gói

## An toàn

- Private payload giá không commit vào Git.
- Chưa migration hoặc sửa dữ liệu production trong nhánh này.
- Chưa ghi/xóa R2.
- Ảnh cho `CREATE_NEW` bổ sung thủ công sau khi catalog đã được xác minh.
- Production chỉ được chạy sau database dry-run `PASS` và phê duyệt production riêng.

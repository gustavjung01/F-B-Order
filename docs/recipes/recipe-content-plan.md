# Kế hoạch nội dung công thức — Bếp Sỉ / F-B-Order

## 1. Quy tắc phase hiện tại

Phần công thức là **offer nội dung tham khảo để kéo khách và hỗ trợ tư vấn**, không phải dữ liệu order thật.

Ở phase hiện tại:

- Không đụng DB/backend/VPS.
- Không phụ thuộc bảng `recipes`, `recipe_ingredients`, `recipe_steps` cho trang live.
- API frontend phải đọc từ static recipe data trong repo.
- DB recipe chỉ dùng lại ở phase sau khi backend/DB được mở riêng.
- Không sửa chắp vá kiểu mobile một nguồn, desktop một nguồn, công thức một nguồn khác.

Nguồn đúng cho frontend/catalog phase:

```txt
apps/frontend/data/catalog/*
apps/frontend/data/recipes/*
```

## 2. Mục tiêu kinh doanh

Công thức dùng để:

1. Cho khách xem ý tưởng món bán được.
2. Gợi ý nguyên liệu cần mua từ catalog Hưng Phát.
3. Khóa định lượng/cách làm chi tiết để khách tạo hồ sơ.
4. Sau khi duyệt hồ sơ, mở định lượng và map nguyên liệu vào giỏ.

Không định vị là bán file công thức rời rạc. Định vị là:

```txt
Ý tưởng menu + tư vấn nguyên liệu + công thức tham khảo để quán test và triển khai.
```

## 3. Luồng mở khóa theo plan

### Plan public — chưa đăng nhập

Cho xem:

- Tên bộ công thức.
- Ảnh cover.
- Mô tả ngắn.
- Phù hợp cho nhóm quán nào.
- Danh sách món trong bộ.
- Nguyên liệu gợi ý, không hiện định lượng.

Khóa:

- Gram/ml cụ thể.
- Cách làm chi tiết.
- Cost món.
- Giá bán đề xuất.
- Nút thêm nguyên liệu vào giỏ.

### Plan logged-in pending — đã đăng nhập, chưa duyệt

Cho xem thêm:

- Danh sách nguyên liệu rõ hơn.
- Brand/sản phẩm gợi ý.
- CTA gửi hồ sơ quán để mở định lượng.

Vẫn khóa:

- Định lượng.
- Cách làm chi tiết.
- Cost.
- Thêm nguyên liệu vào giỏ.

### Plan approved — khách đã được duyệt

Mở:

- Định lượng từng nguyên liệu.
- Cách làm từng bước.
- Ghi chú vận hành.
- Nguyên liệu map sản phẩm.
- Nút thêm nguyên liệu vào giỏ.

## 4. Bộ công thức ưu tiên

| Ưu tiên | Bộ công thức | Vai trò bán hàng |
| --- | --- | --- |
| 1 | 10 công thức dễ pha dễ bán Lộc Phát | Dễ chốt khách mới, quán nhỏ, người mới mở |
| 2 | 12 công thức trà trái cây Lộc Phát | Upsell trà nền Lộc Phát, syrup, trái cây ngâm |
| 3 | 10 công thức trà sữa chuẩn gu | Upsell trà, bột sữa, topping |
| 4 | 15 công thức trà trái cây | Làm menu mùa hè, tăng lựa chọn cho quán |
| 5 | Giải pháp trà pha máy 2025 | Đánh nhóm quán cafe/trà sữa muốn menu trend |
| 6 | 5 công thức uống nóng Noel | Mùa vụ, chưa cần ưu tiên doanh thu chính |

## 5. Danh sách món public theo từng bộ

### 10 công thức dễ pha dễ bán Lộc Phát

1. Trà đào cam sả
2. Trà tắc mật ong
3. Trà chanh dây
4. Trà vải
5. Trà dâu
6. Trà xoài nhiệt đới
7. Trà ổi hồng
8. Trà sữa truyền thống
9. Trà sữa ô long
10. Trà sữa pudding

### 12 công thức trà trái cây Lộc Phát

1. Trà đào cam sả
2. Trà vải hoa hồng
3. Trà chanh dây
4. Trà tắc xí muội
5. Trà dâu tây
6. Trà xoài
7. Trà ổi hồng
8. Trà lựu đỏ
9. Trà cam quế
10. Trà táo xanh
11. Trà kiwi
12. Trà nhiệt đới mix

### 10 công thức trà sữa chuẩn gu

1. Trà sữa truyền thống
2. Trà sữa ô long
3. Trà sữa thái xanh
4. Trà sữa socola
5. Trà sữa matcha
6. Trà sữa caramel
7. Trà sữa pudding
8. Trà sữa trân châu đường đen
9. Trà sữa dừa
10. Trà sữa kem cheese

### 15 công thức trà trái cây

1. Trà đào
2. Trà vải
3. Trà tắc
4. Trà chanh
5. Trà cam
6. Trà chanh dây
7. Trà dâu
8. Trà xoài
9. Trà kiwi
10. Trà ổi
11. Trà táo
12. Trà lựu
13. Trà nho
14. Trà thơm
15. Trà trái cây nhiệt đới

### Giải pháp trà pha máy 2025

1. Trà đào pha máy
2. Trà vải pha máy
3. Trà chanh dây pha máy
4. Trà ô long sữa pha máy
5. Trà sữa nền pha máy
6. Trà trái cây sparkling
7. Trà cold brew trái cây
8. Trà cam quế
9. Trà dâu kem cheese
10. Trà nhiệt đới signature

### 5 công thức uống nóng Noel

1. Cacao nóng marshmallow
2. Trà sữa nóng caramel
3. Matcha latte nóng
4. Sữa dừa nóng
5. Trà cam quế nóng

## 6. Quy tắc nội dung

- Dùng từ **công thức tham khảo**.
- Không ghi là công thức chuẩn tuyệt đối.
- Không hứa lợi nhuận chắc chắn.
- Không tự bịa giá vốn nếu chưa có giá sỉ thật.
- Cost và giá bán đề xuất chỉ mở sau khi dữ liệu giá ổn.
- Công thức phải map được về sản phẩm trong catalog càng nhiều càng tốt.

Câu mô tả chuẩn:

```txt
Công thức tham khảo để quán test menu, có thể tinh chỉnh theo khẩu vị khách khu vực.
```

## 7. Quy tắc kỹ thuật API

Trong phase frontend/catalog:

```txt
/api/catalog/products -> đọc static catalog
/api/recipes -> đọc static recipe offers
/api/recipes/[slug] -> đọc static recipe detail
```

Không để desktop gọi DB trong khi mobile gọi static catalog.
Không để recipe page gọi DB trong khi DB chưa mở phase.

Sau này khi DB/backend được mở lại, migration đúng là:

1. Chuyển static recipe offers thành seed SQL.
2. Đổ vào `recipes`, `recipe_ingredients`, `recipe_steps`.
3. Chỉ khi DB có dữ liệu active ổn mới đổi API về DB.
4. Không vừa DB vừa static ngầm nếu chưa có cờ cấu hình rõ ràng.

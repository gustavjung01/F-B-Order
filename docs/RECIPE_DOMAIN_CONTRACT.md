# RECIPE DOMAIN CONTRACT

## 1. Phạm vi R0

R0 chỉ chốt ngôn ngữ chung và các bất biến nghiệp vụ cho nhánh Công thức.

R0 có:

- Type contract dùng chung.
- Quy tắc trạng thái và publish.
- Quy tắc nguyên liệu Catalog V2.
- Quy tắc đơn vị, scale và cost readiness.
- Quy tắc version/snapshot.
- Quy tắc phân biệt dữ liệu người nhập, AI tạo và dữ liệu import.
- Payload mẫu hoàn chỉnh.

R0 không có:

- Migration.
- Table production.
- API.
- UI.
- Google Agent runtime.
- Thay đổi Catalog V2.
- Thay đổi cart/order.

Type contract chính nằm tại:

```text
packages/shared/src/recipe-domain.ts
```

Payload mẫu nằm tại:

```text
docs/examples/recipe-domain-example.json
```

---

## 2. Ranh giới domain

Mỗi domain sở hữu đúng một nhóm sự thật:

```text
Recipe
  sở hữu nội dung món, định lượng sử dụng, cách làm, lỗi, bí quyết,
  mùa vụ, quy đổi bao bì đã duyệt và version nội dung.

Catalog V2
  sở hữu parent product, variant, SKU, lựa chọn vị/loại,
  trạng thái active/public/orderable và ảnh sản phẩm.

Pricing
  sở hữu giá hiện hành và quyền xem/mua theo customer identity.

Cart
  sở hữu dòng giỏ hàng và identity variant_id + selection_key.

Order
  sở hữu snapshot giao dịch tại thời điểm đặt hàng.

AI Agent
  sở hữu suy luận và đề xuất, không sở hữu sự thật giao dịch.
```

Recipe không được tạo một catalog sản phẩm thứ hai.

---

## 3. Trạng thái công thức

```text
draft -> in_review -> published -> archived
```

### `draft`

- Được sửa tự do bởi người có quyền.
- Có thể thiếu dữ liệu.
- Không hiển thị cho khách.
- AI được phép tạo hoặc bổ sung draft.

### `in_review`

- Đang chờ kiểm tra.
- Không hiển thị cho khách.
- Thay đổi nội dung phải đưa lại về review hoặc ghi rõ phiên review mới.

### `published`

- Hiển thị theo `visibility`.
- Bắt buộc vượt publish validation.
- Mỗi lần publish tạo một version snapshot bất biến.
- AI không được tự chuyển trạng thái sang published.

### `archived`

- Không còn xuất hiện trong danh sách công khai.
- Không bị xóa dữ liệu lịch sử.
- Version và liên kết order attribution cũ vẫn tồn tại.

Không dùng trạng thái `deleted` cho nghiệp vụ bình thường. Xóa cứng chỉ dành cho dữ liệu test hoặc quy trình quản trị đặc biệt.

---

## 4. Visibility

```text
public
internal
```

- `public`: khách được xem khi recipe ở trạng thái published.
- `internal`: chỉ staff/admin được xem.

Không suy luận quyền chỉ từ status. Backend phải kiểm tra cả status, visibility và identity.

---

## 5. Recipe document

Một recipe document hoàn chỉnh gồm:

```text
Thông tin chính
Nguyên liệu
Các bước
Lỗi thường gặp
Bí quyết kinh doanh
Quy tắc theo mùa
Tags
Nguồn tạo nội dung
```

Các field bắt buộc trước publish:

- `slug`
- `title`
- `shortDescription`
- `difficulty`
- `prepMinutes`
- `cookMinutes`
- `yieldQuantity`
- `yieldUnit`
- Ít nhất một ingredient.
- Ít nhất một step.
- `sortOrder` không trùng trong cùng section.

`aliases`, `mistakes`, `businessTips`, `seasonalRules`, `tags` có thể rỗng.

---

## 6. Đơn vị canonical

Chỉ các đơn vị sau được dùng bởi scale/cost engine:

```text
g
kg
ml
l
piece
portion
pack
```

Quy tắc:

1. Không lưu `muỗng`, `vá`, `nhúm`, `ly`, `chai nhỏ` làm đơn vị tính production.
2. Các cách gọi bếp phải được quy đổi sang đơn vị canonical trước khi recipe được đánh dấu calculation-ready.
3. Không tự đổi khối lượng sang thể tích.
4. Chỉ đổi `g <-> kg` và `ml <-> l` khi không có conversion đặc biệt.
5. `piece`, `portion`, `pack` là đơn vị đếm; không tự đổi sang g/ml.
6. Muốn đổi `g <-> ml` phải có density hoặc conversion riêng được người có quyền duyệt. Density chưa nằm trong contract R0.

Ví dụ:

```text
Sai: 2 muỗng siro
Đúng: 30 ml siro
```

---

## 7. Yield

`yieldQuantity` và `yieldUnit` mô tả sản lượng chuẩn của recipe.

Ví dụ:

```json
{
  "yieldQuantity": 10,
  "yieldUnit": "portion"
}
```

Scale factor chuẩn:

```text
targetYieldQuantity / sourceYieldQuantity
```

Scale engine về sau phải dùng phép tính xác định bằng code. AI chỉ được giải thích hoặc cảnh báo về chất lượng khi scale lớn.

---

## 8. Nguồn nguyên liệu

```text
catalog
external
```

### `catalog`

Nguyên liệu có liên kết Catalog V2.

Bắt buộc có:

- `catalog.productId`
- Snapshot tên parent product.

Có thể chưa có variant nếu admin mới chỉ gắn parent để tham khảo. Khi đó ingredient chưa cart-ready và chưa đủ dữ liệu để tính cost chính xác.

### `external`

Nguyên liệu không bán qua Catalog V2, ví dụ:

- Nước.
- Đá.
- Muối.
- Nguyên liệu tươi mua ngoài.

Không được gắn catalog giả để ép nguyên liệu external thành sản phẩm Bếp Sỉ.

---

## 9. Parent product, variant và selections

Một nguyên liệu Catalog V2 có thể gồm ba lớp:

```text
Parent product
  -> Sellable variant/SKU
      -> Non-pricing selections
```

Ví dụ:

```text
Parent product: Siro Golden Farm
Variant: Chai 700 ml
Selection: Vị Đào
```

### `productId`

- ID parent product Catalog V2.
- Dùng để hiển thị và giữ quan hệ nhóm sản phẩm.

### `variantId`

- ID SKU bán được.
- Dùng cho price, cart và order.
- Không được thay bằng productId.

### `selections`

Object lựa chọn không làm đổi SKU, ví dụ:

```json
{
  "flavor": "Đào"
}
```

### `selectionKey`

Chuỗi canonical tạo từ selections theo cùng thuật toán Catalog/cart.

Ví dụ:

```text
flavor=%C4%90%C3%A0o
```

Recipe không được tự đặt một định dạng selection key khác.

---

## 10. Điều kiện `cartReady`

`cartReady = true` chỉ khi tất cả điều kiện sau đúng tại thời điểm validation:

1. Ingredient có `sourceType = catalog`.
2. Có `productId`.
3. Có `variantId`.
4. Variant thuộc đúng parent product.
5. Variant đang tồn tại trong Catalog V2.
6. Mọi required choice đều có selection.
7. Selection hợp lệ với đúng SKU.
8. `selectionKey` khớp với selections.
9. Có package conversion đủ để tính số lượng cần mua.

`cartReady` không đảm bảo sản phẩm đang orderable mãi mãi. Trước khi thêm giỏ, backend vẫn phải kiểm tra lại:

- Active/public/orderable.
- Giá hiện hành.
- Customer approval.
- Selection validity.

Không tin giá trị `cartReady` do frontend hoặc AI gửi lên.

---

## 11. Package conversion

Recipe cần biết lượng sử dụng, trong khi Catalog bán theo chai/gói/thùng. Vì vậy ingredient có conversion riêng:

```text
packageContentQuantity
packageContentUnit
wastePercent
usableYieldPercent
```

Ví dụ một chai 700 ml:

```json
{
  "packageContentQuantity": 700,
  "packageContentUnit": "ml",
  "wastePercent": 2,
  "usableYieldPercent": 98
}
```

Quy tắc:

- Dữ liệu conversion do admin xác nhận.
- AI có thể đề xuất nhưng provenance phải là `ai` cho đến khi người duyệt áp dụng.
- Không parse chuỗi `700 ml`, `Thùng 12 chai` từ giao diện rồi xem là nguồn production đáng tin cậy.
- `wastePercent` và `usableYieldPercent` không được tạo kết quả phi lý.
- Publish validator phải cảnh báo nếu cả hai tỷ lệ mâu thuẫn.

Trong R1 có thể lưu các field này trực tiếp ở recipe ingredient. Không được thêm chúng vào Catalog V2 khi chưa có thiết kế catalog riêng.

---

## 12. Optional ingredient

`isOptional = true` nghĩa là:

- Không bắt buộc để hoàn thành recipe cơ bản.
- Không tự đưa vào cart preview mặc định.
- Chỉ tính cost khi request hoặc published business rule yêu cầu tính optional.

Optional không có nghĩa là field có thể sai dữ liệu. Nếu ingredient optional được chọn để thêm giỏ thì vẫn phải validate đầy đủ.

---

## 13. Sort order

Mọi section dạng danh sách dùng `sortOrder` integer.

Quy tắc:

- Giá trị bắt đầu từ 1.
- Không trùng trong cùng recipe/section.
- Backend là nơi chuẩn hóa cuối cùng.
- Không dùng array index làm identity lâu dài.

`relatedStepOrder` của mistake tham chiếu thứ tự step tại version hiện tại. Khi publish snapshot, giá trị này được giữ nguyên trong snapshot.

---

## 14. Step contract

Mỗi step có:

- `instruction` bắt buộc.
- `sortOrder` bắt buộc.
- `durationSeconds` tùy chọn.
- `temperatureCelsius` tùy chọn.
- `successMarker` tùy chọn nhưng rất nên có.
- `warning` tùy chọn.

Không nhét toàn bộ quy trình thành một đoạn text duy nhất nếu muốn AI review, reorder hoặc hiển thị từng bước.

---

## 15. Mistake contract

Một lỗi thường gặp phải tách:

```text
Triệu chứng
Nguyên nhân có khả năng
Cách cứu mẻ hiện tại
Cách phòng tránh mẻ sau
Bước liên quan
Mức nghiêm trọng
```

AI được phép đề xuất nhiều nguyên nhân và xếp mức khả năng trong nội dung. Dữ liệu published phải được người duyệt chấp nhận.

---

## 16. Business tip contract

Business tip là lời khuyên vận hành, không phải giá giao dịch.

Có thể chứa:

- Khách mục tiêu.
- Thời điểm bán.
- Combo.
- Bao bì.
- Bảo quản.
- Chuẩn bị theo mẻ.

Không lưu giá vốn runtime hoặc giá hiện hành vào text tip như nguồn sự thật. Cost engine trả số riêng kèm thời điểm tính.

---

## 17. Seasonal rule contract

Loại rule:

```text
month_range
festival
weather
always
```

Quy tắc:

- `month_range`: cần `startMonth`, `endMonth` trong khoảng 1–12.
- `festival`: cần tên dịp/lễ.
- `weather`: cần điều kiện thời tiết mô tả rõ.
- `always`: không cần tháng/lễ/thời tiết.
- `regions` rỗng nghĩa là áp dụng chung, không phải dữ liệu thiếu.
- `priority` số lớn hơn nghĩa là ưu tiên cao hơn khi có nhiều rule khớp.

Thông tin xu hướng mới từ web/AI chỉ là đề xuất cho đến khi được duyệt vào seasonal rule.

---

## 18. Provenance

Mỗi record nội dung có provenance:

```text
human
ai
imported
```

### `human`

Nội dung do người tạo hoặc đã chủ động áp dụng/chỉnh sửa.

### `ai`

Nội dung đang phản ánh output AI. Nên có:

- `aiRunId`
- `promptVersion`

### `imported`

Nội dung nhập từ nguồn ngoài. Nên có `importedSource`.

Provenance dùng để audit, không dùng để tự quyết định nội dung đúng hay sai.

Khi admin chỉnh một đề xuất AI thành nội dung riêng, service có thể đổi source thành `human` và giữ AI run trong audit log riêng ở phase sau.

---

## 19. Publish validation

Publish phải bị chặn khi có lỗi cấp `error`.

### Blocking errors tối thiểu

- Slug/title/description rỗng.
- Yield không hợp lệ.
- Không có ingredient.
- Không có step.
- Quantity <= 0.
- Unit không canonical.
- Sort order trùng.
- Ingredient catalog thiếu productId.
- `cartReady = true` nhưng thiếu variant/selections/conversion.
- Variant không thuộc product.
- Required selection thiếu hoặc sai SKU.
- Selection key không khớp.
- Month ngoài 1–12.
- Snapshot không serialize được.

### Warning tối thiểu

- Ingredient catalog chưa cart-ready.
- Thiếu success marker ở step quan trọng.
- Thiếu mistake guide.
- Thiếu business tip.
- Package conversion chưa có.
- Waste/yield có dấu hiệu bất thường.
- Ingredient linked product đã inactive.

Warning không nhất thiết chặn publish, tùy policy admin về sau.

---

## 20. Versioning

Mỗi lần publish tạo `RecipeVersionSnapshot` bất biến gồm toàn bộ `RecipeDocument`.

Quy tắc:

1. `versionNumber` tăng tuần tự theo recipe.
2. Snapshot không được sửa sau khi tạo.
3. Restore không ghi đè version cũ.
4. Restore tạo draft mới từ snapshot, sau đó publish thành version mới.
5. Catalog snapshot trong ingredient giữ tên/SKU/quy cách tại thời điểm publish.
6. Giá không nằm trong published recipe snapshot như giá giao dịch authoritative.

---

## 21. Snapshot Catalog

Recipe giữ cả FK và snapshot:

```text
FK -> biết đối tượng Catalog V2 hiện tại
Snapshot -> giữ cách recipe đã được duyệt tại version đó
```

Snapshot gồm tối thiểu:

- Parent product name.
- Variant name.
- SKU.
- Specification.
- Selection key.

Khi catalog đổi tên:

- Recipe current view có thể hiển thị dữ liệu hiện tại hoặc snapshot theo policy.
- Version history luôn phải có snapshot cũ.

Khi variant inactive:

- Recipe vẫn đọc được.
- Add-to-cart bị chặn hoặc yêu cầu admin chọn thay thế.

---

## 22. Scale contract

R0 chỉ chốt input/output, chưa triển khai thuật toán.

Input:

```json
{
  "recipeId": "...",
  "targetYieldQuantity": 80,
  "targetYieldUnit": "portion"
}
```

Output phải có:

- Source yield.
- Target yield.
- Scale factor.
- Lượng dùng sau scale.
- Lượng sau hao hụt.
- Số gói/chai cần mua nếu đủ conversion.
- Phần dư.
- Warnings.

Không đổi unit không tương thích chỉ để tạo ra con số.

---

## 23. Cost readiness

Ingredient đủ điều kiện tính cost theo Catalog V2 khi:

- Có variant.
- Có valid selections nếu bắt buộc.
- Có package conversion.
- Usage unit tương thích package unit.
- Pricing resolver trả giá hợp lệ tại thời điểm request.

Nếu thiếu bất kỳ điều kiện nào:

- Cost result phải trả warning/missing state.
- Không tự điền giá 0.
- Không để AI đoán giá.

Nguyên liệu external về sau có thể có cost estimate do admin nhập, nhưng phải tách khỏi Catalog V2 price source.

---

## 24. AI boundary

AI được phép:

- Tạo RecipeDocument draft.
- Đề xuất định lượng.
- Phản biện bước làm.
- Đề xuất mistake/business/seasonal content.
- Nêu giả định.
- Đề xuất catalog search query hoặc candidate.

AI không được:

- Tự publish.
- Tự xác nhận conversion.
- Tự tạo SKU.
- Tự sửa Catalog V2.
- Tự xác nhận giá.
- Tự thêm giỏ khi khách chưa xác nhận.
- Gửi thẳng SQL hoặc truy cập database.

Structured output AI phải map vào contract này trước khi được lưu draft.

---

## 25. Compatibility rule với Catalog/cart/order

Khi triển khai R5–R8:

- Reuse choice parsing/validation hiện tại.
- Reuse selection-key algorithm hiện tại.
- Reuse pricing resolver hiện tại.
- Reuse hoặc tách cart domain service hiện tại.
- Không tạo một format cart item riêng cho recipe.
- Không đổi order payload chỉ vì nguồn item là recipe.

Nguồn attribution recipe có thể được bổ sung sau bằng metadata riêng, nhưng transaction item vẫn là Catalog V2 variant + selections.

---

## 26. Ví dụ scale 10 thành 80 phần

Recipe gốc:

```text
Yield: 10 portion
Siro: 300 ml
```

Target:

```text
80 portion
```

Scale factor:

```text
80 / 10 = 8
```

Raw usage:

```text
300 ml × 8 = 2400 ml
```

Nếu waste 2% và chai 700 ml, engine về sau phải tính bằng code theo policy đã chốt. AI không phải nguồn của kết quả số này.

---

## 27. Những quyết định hoãn sang phase sau

R0 cố ý chưa chốt:

- Database column type chi tiết.
- Density conversion.
- Cost external ingredient.
- Recipe localization đa ngôn ngữ.
- Nutrition.
- Inventory reservation.
- Supplier-specific package conversion.
- Recipe ownership theo customer.
- Public comments/rating/favorites.
- AI provider SDK và model cụ thể.

Các phần này không được tự thêm vào R1 nếu chưa cập nhật contract.

---

## 28. Acceptance checklist R0

R0 hoàn tất khi:

- [x] Có shared TypeScript contract.
- [x] Có export từ `@fb-order/shared`.
- [x] Có trạng thái recipe rõ ràng.
- [x] Có contract nguyên liệu catalog/external.
- [x] Có parent/variant/selections/selectionKey rule.
- [x] Có cart-ready và cost-ready rule.
- [x] Có canonical units.
- [x] Có version/snapshot rule.
- [x] Có provenance human/ai/imported.
- [x] Có scale input/output contract.
- [x] Có payload mẫu hoàn chỉnh.
- [x] Không có migration hoặc thay đổi runtime.

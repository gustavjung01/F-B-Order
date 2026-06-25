# PLAN - Công thức F&B + AI Agent

## 1. Mục tiêu

Xây dựng nhánh **Công thức F&B** thành một hệ thống tư vấn thực chiến cho chủ quán, sử dụng **Google Gemini Enterprise Agent Platform / Vertex AI Agent Builder** làm nền tảng AI.

AI không chỉ đọc lại công thức có sẵn. AI phải có khả năng suy luận như một **chuyên gia ẩm thực F&B kiêm cố vấn vận hành và kinh doanh**, biết:

- Phân tích món và kỹ thuật chế biến.
- Phát hiện nguyên nhân món bị lỗi.
- Điều chỉnh công thức theo số lượng, khẩu vị và mô hình bán.
- Đề xuất nguyên liệu phù hợp trong catalog Bếp Sỉ.
- Tư vấn giá vốn, giá bán, combo và mùa bán.
- Đưa ra nhiều phương án khi dữ liệu chưa đủ, thay vì trả lời máy móc.

Tuy nhiên, AI không được tự bịa dữ liệu giao dịch. Giá bán, SKU, tồn tại sản phẩm, quy cách, giỏ hàng và đơn hàng luôn lấy từ backend Bếp Sỉ.

---

## 2. Nguyên tắc thiết kế AI

### 2.1. Không khóa AI thành chatbot trả lời theo mẫu

Agent được trao không gian suy luận rộng trong phạm vi chuyên môn:

- Có thể dùng kiến thức nền ẩm thực của Gemini.
- Có thể so sánh nhiều kỹ thuật nấu.
- Có thể suy luận nguyên nhân lỗi từ triệu chứng.
- Có thể đề xuất phương án thay thế ngoài công thức gốc.
- Có thể phản biện công thức nếu thấy tỷ lệ, nhiệt độ hoặc quy trình bất hợp lý.
- Có thể chủ động hỏi thêm khi thiếu dữ liệu quan trọng.
- Có thể nêu giả định và mức độ chắc chắn.

Không ép mọi câu trả lời phải trích đúng từng dòng từ kho dữ liệu nội bộ. Dữ liệu nội bộ là nguồn sự thật cho Bếp Sỉ; kiến thức chuyên môn của model là nguồn mở rộng để agent tư vấn sâu.

### 2.2. Khóa theo hành động, không khóa theo tư duy

Không hạn chế khả năng phân tích của AI. Chỉ kiểm soát các hành động có hậu quả:

- Không tự sửa công thức đã xuất bản.
- Không tự đăng công thức.
- Không tự thêm giỏ hàng hoặc đặt đơn nếu khách chưa xác nhận.
- Không tự công bố giá, tồn kho hoặc SKU khi chưa gọi tool backend.
- Không tự ghi dữ liệu vào database ngoài các API được cấp.
- Không truy cập backend hoặc database của website khác cùng VPS.

### 2.3. Phân biệt rõ ba loại thông tin

Mỗi câu trả lời nội bộ của agent cần phân biệt:

1. **Dữ liệu Bếp Sỉ**: sản phẩm, giá, quy cách, công thức đã duyệt.
2. **Kiến thức chuyên môn**: kiến thức ẩm thực và kinh doanh của model.
3. **Suy luận/giả định**: kết luận dựa trên thông tin khách cung cấp.

Agent không cần luôn trình bày ba nhãn ra giao diện, nhưng phải giữ được ranh giới này trong logic.

---

## 3. Nhân cách agent chính

Tên nội bộ: `BepsiCulinaryExpertAgent`

### Vai trò

Bạn là chuyên gia ẩm thực F&B thực chiến tại Việt Nam, có kinh nghiệm phát triển món, chuẩn hóa công thức, vận hành quán, kiểm soát giá vốn và xây menu theo mùa.

### Phong cách

- Quyết đoán, thực tế, nói rõ phương án nào tốt nhất.
- Không trả lời chung chung kiểu “có thể cân nhắc”.
- Khi có nhiều cách làm, phải xếp hạng và giải thích đánh đổi.
- Ưu tiên giải pháp phù hợp với mô hình kinh doanh nhỏ và vừa.
- Hiểu cách bán trà sữa, trà trái cây, cà phê, đồ ăn vặt, mì cay, lẩu và món phổ biến tại Việt Nam.
- Luôn ưu tiên nguyên liệu Bếp Sỉ nếu phù hợp, nhưng không cố ép sản phẩm vào món khi không hợp kỹ thuật.

### Cách xử lý khi thiếu dữ liệu

- Không từ chối ngay.
- Đưa ra phương án tốt nhất dựa trên giả định hợp lý.
- Nêu rõ giả định quan trọng.
- Chỉ hỏi thêm khi câu trả lời có thể sai lệch lớn nếu thiếu dữ liệu.

### Cách xử lý bất đồng với công thức hiện tại

Agent được quyền nói rõ:

- Công thức đang có tỷ lệ chưa hợp lý.
- Bước chế biến có nguy cơ gây lỗi.
- Nguyên liệu được gắn không phù hợp.
- Giá bán mục tiêu không đạt biên lợi nhuận.

Agent phải giải thích nguyên nhân và đề xuất bản sửa, nhưng không tự ghi đè công thức chính thức.

---

## 4. Kiến trúc tổng thể

```text
Customer/Admin Frontend
        |
        v
Bếp Sỉ Backend API (Node.js/Express)
        |
        +--> Recipe database / Product catalog / Pricing / Cart
        |
        +--> Recipe AI Gateway
                  |
                  v
Google Agent Platform / Agent Engine
                  |
                  +--> Culinary Expert Agent
                  +--> Recipe Draft Agent
                  +--> Recipe Review Agent
                  +--> Troubleshooting Agent
                  +--> Business Advisor Agent
                  |
                  +--> Bếp Sỉ tools
                  +--> Approved recipe knowledge
                  +--> Optional web/search grounding
```

Frontend không gọi trực tiếp Google Agent Platform. Mọi request đi qua backend để:

- Xác thực Clerk.
- Kiểm soát quyền.
- Gắn đúng customer context.
- Ẩn credential Google Cloud.
- Ghi log chi phí và chất lượng.
- Kiểm tra tool call.
- Ngăn agent truy cập nhầm backend khác trên VPS.

---

## 5. Mô hình agent

### Giai đoạn đầu: một agent chính + các workflow chuyên biệt

Không triển khai multi-agent quá phức tạp ngay từ đầu.

`BepsiCulinaryExpertAgent` là agent giao tiếp chính. Agent chọn tool hoặc chuyển sang workflow phù hợp:

- `create_recipe_draft`
- `review_recipe`
- `diagnose_food_issue`
- `scale_recipe`
- `suggest_substitutions`
- `calculate_recipe_cost`
- `advise_business`
- `advise_seasonal_menu`

### Giai đoạn sau: tách sub-agent

Khi dữ liệu và lưu lượng đủ lớn, tách thành:

#### Recipe Draft Agent

Tạo bản nháp công thức đầy đủ từ mục tiêu món, giá bán và nguyên liệu ưu tiên.

#### Recipe Review Agent

Phản biện công thức, phát hiện lỗi kỹ thuật và thiếu dữ liệu.

#### Troubleshooting Agent

Chẩn đoán món hỏng từ mô tả, quy trình và hình ảnh.

#### Business Advisor Agent

Tư vấn giá bán, menu, combo, mô hình quán và khả năng sinh lời.

#### Seasonal Menu Agent

Kết hợp mùa, khu vực, nhóm khách và catalog để đề xuất món.

Agent chính chịu trách nhiệm tổng hợp, tránh để khách phải nói chuyện với nhiều bot rời rạc.

---

## 6. Tools agent được sử dụng

### Nhóm chỉ đọc

```text
get_recipe(recipe_id)
search_recipes(query, filters)
get_recipe_products(recipe_id)
search_catalog_products(query, category, use_case)
get_product_detail(product_id)
get_customer_price(product_id, customer_id)
get_recipe_cost(recipe_id, customer_id, yield)
get_related_recipes(recipe_id)
get_seasonal_rules(region, month)
```

### Nhóm tính toán

```text
scale_recipe(recipe_id, target_yield)
calculate_cost(ingredients, customer_id)
calculate_margin(cost, selling_price)
convert_units(quantity, from_unit, to_unit)
compare_recipe_versions(recipe_id, version_a, version_b)
```

Các phép tính định lượng và tiền phải chạy bằng code/tool, không để model tự tính toàn bộ bằng văn bản.

### Nhóm tạo bản nháp

```text
save_recipe_ai_draft(payload)
save_recipe_ai_review(payload)
save_ai_business_advice(payload)
```

Chỉ ghi vào khu vực draft/review, không ghi thẳng vào bản published.

### Nhóm hành động cần xác nhận

```text
prepare_add_recipe_to_cart(recipe_id, target_yield)
confirm_add_items_to_cart(cart_token)
```

Agent được chuẩn bị danh sách, nhưng chỉ thực hiện sau khi người dùng xác nhận.

---

## 7. Nguồn kiến thức và grounding

### 7.1. Dữ liệu có cấu trúc qua tool

Bắt buộc dùng tool cho:

- Sản phẩm có thật.
- SKU và biến thể.
- Quy cách.
- Giá theo khách.
- Thành phần giỏ hàng.
- Công thức đã duyệt.
- Trạng thái công thức.

### 7.2. Kho kiến thức nội bộ

Đưa vào knowledge store:

- Công thức đã duyệt.
- Ghi chú lỗi thường gặp.
- Hướng dẫn bảo quản.
- Tài liệu kỹ thuật của nhà cung cấp.
- Bảng quy đổi đơn vị.
- Nguyên tắc cost và định lượng.
- Kinh nghiệm vận hành đã được Bếp Sỉ xác nhận.

Dữ liệu cần có metadata:

```text
source_type
recipe_id
product_id
category
approved_at
approved_by
version
confidence
```

### 7.3. Kiến thức nền của Gemini

Cho phép agent sử dụng kiến thức nền để:

- Giải thích phản ứng nguyên liệu.
- So sánh kỹ thuật nấu.
- Đề xuất kỹ thuật thay thế.
- Suy luận nguyên nhân lỗi.
- Phát triển biến thể món.
- Tư vấn tổ chức menu.

Không bắt agent chỉ được nói những gì có trong knowledge store.

### 7.4. Web grounding tùy trường hợp

Có thể bật cho các câu hỏi thật sự cần thông tin mới:

- Xu hướng món mới.
- Mùa vụ và lễ hội.
- Thị trường hoặc hành vi tiêu dùng hiện tại.

Không dùng web grounding cho giá và hàng hóa Bếp Sỉ.

---

## 8. Luồng nghiệp vụ chính

### 8.1. Admin tạo công thức bằng AI

1. Admin nhập tên món, số phần, giá bán mục tiêu, loại khách và nguyên liệu muốn ưu tiên.
2. Backend lấy nhóm sản phẩm phù hợp từ catalog.
3. Agent xây công thức dựa trên kiến thức chuyên môn và sản phẩm thực tế.
4. Agent gọi tool tính cost.
5. Agent tự phản biện bản nháp một lượt.
6. Lưu vào `recipe_ai_drafts`.
7. Admin chỉnh sửa.
8. Chạy Recipe Review Agent.
9. Admin duyệt và xuất bản.

### 8.2. Khách hỏi về công thức

1. Backend tải công thức, sản phẩm liên quan và quyền khách.
2. Agent nhận công thức làm context chính.
3. Agent được suy luận rộng bằng kiến thức chuyên gia.
4. Khi nhắc sản phẩm hoặc giá, agent gọi tool Bếp Sỉ.
5. Trả lời kèm phương án hành động rõ ràng.

### 8.3. Chẩn đoán món lỗi

1. Thu thập triệu chứng.
2. Thu thập định lượng và các bước khách đã làm.
3. Nhận ảnh nếu có.
4. Agent lập danh sách nguyên nhân theo mức khả năng.
5. Đề xuất kiểm tra nhanh để loại trừ từng nguyên nhân.
6. Đưa cách cứu mẻ hiện tại.
7. Đưa cách phòng tránh cho mẻ sau.
8. Gợi ý sản phẩm thay thế khi thực sự phù hợp.

### 8.4. Tư vấn kinh doanh

Agent nhận:

- Mô hình bán.
- Khu vực.
- Khách mục tiêu.
- Ngân sách.
- Giá bán mong muốn.
- Thiết bị đang có.
- Sản phẩm đã mua hoặc đang quan tâm.

Agent trả:

- Menu khởi đầu nên bán.
- Món chủ lực.
- Nguyên liệu dùng chéo.
- Combo.
- Giá vốn tính từ backend.
- Giá bán và biên lợi nhuận.
- Rủi ro tồn hàng.
- Kế hoạch theo mùa.

---

## 9. Prompt và instruction strategy

### System instruction không viết thành danh sách cấm dài

System instruction tập trung vào:

- Vai trò chuyên gia.
- Mục tiêu tạo kết quả thực chiến.
- Phân biệt dữ liệu thật và suy luận.
- Quy tắc gọi tool.
- Quyền phản biện.
- Cách trình bày quyết đoán.

Các giới hạn kỹ thuật, quyền ghi dữ liệu và xác nhận hành động phải đặt ở backend/tool permission, không nhồi toàn bộ vào prompt.

### Context theo từng request

Không gửi toàn bộ catalog và toàn bộ kho công thức.

Backend chọn context liên quan:

- 1 công thức hiện tại.
- Các phiên bản cần so sánh.
- Tối đa nhóm sản phẩm phù hợp nhất.
- Giá của đúng customer.
- Các ghi chú kỹ thuật liên quan.
- Tóm tắt hội thoại trước đó.

### Long context

Tận dụng khả năng context lớn của Gemini cho:

- Phân tích toàn bộ công thức dài.
- So sánh nhiều phiên bản.
- Đọc tài liệu nhà cung cấp.
- Phân tích lịch sử lỗi và phản hồi khách.

Không dùng context lớn làm lý do gửi dữ liệu thừa hoặc dữ liệu của khách khác.

---

## 10. Database bổ sung cho AI

```text
recipe_ai_drafts
recipe_ai_reviews
recipe_ai_sessions
recipe_ai_messages
recipe_ai_runs
recipe_ai_tool_calls
recipe_ai_feedback
recipe_ai_prompt_versions
recipe_ai_evaluations
```

### recipe_ai_runs

```text
id
user_id
customer_id
recipe_id
agent_name
model_name
prompt_version
input_tokens
output_tokens
latency_ms
status
error_code
created_at
```

### recipe_ai_tool_calls

```text
id
run_id
tool_name
request_json
response_summary_json
status
duration_ms
created_at
```

Không ghi secrets, access token hoặc toàn bộ dữ liệu nhạy cảm vào log.

---

## 11. Backend module

```text
apps/backend/src/modules/recipe-ai/
  recipe-ai.routes.ts
  recipe-ai.controller.ts
  recipe-ai.service.ts
  recipe-ai.gateway.ts
  recipe-ai.context.ts
  recipe-ai.permissions.ts
  recipe-ai.tools.ts
  recipe-ai.schemas.ts
  recipe-ai.prompts.ts
  recipe-ai.telemetry.ts

apps/backend/src/modules/recipe-ai/agents/
  culinary-expert.agent.ts
  recipe-draft.agent.ts
  recipe-review.agent.ts
  troubleshooting.agent.ts
  business-advisor.agent.ts
  seasonal-menu.agent.ts
```

Nếu Agent Builder/Agent Engine dùng Python hoặc ADK Python thuận lợi hơn, triển khai một service agent riêng trên Google Cloud. Backend Express vẫn là cửa vào duy nhất từ frontend.

```text
Bếp Sỉ backend -> authenticated internal call -> Agent service
```

Không đặt agent service chung process với backend đặt hàng trong giai đoạn production.

---

## 12. Bảo mật và phân tách hệ thống

VPS hiện có nhiều backend. Module AI phải định danh rõ backend Bếp Sỉ.

- Dùng service account riêng cho agent.
- Quyền tối thiểu theo từng tài nguyên.
- Không dùng credential chung với website khác.
- Tool endpoint chỉ expose API Bếp Sỉ cần thiết.
- Mỗi tool kiểm tra service identity.
- Mỗi request giữ `customer_id`, `user_id`, `request_id`.
- Không cho agent gọi URL tùy ý.
- Không cho agent tự tạo SQL.
- Không cho agent đọc database trực tiếp.
- Không đưa SSH key hoặc secret vào knowledge store/prompt.

---

## 13. Đánh giá chất lượng

Không đánh giá agent bằng tiêu chí “có nói đúng y hệt công thức không”.

Bộ đánh giá gồm:

### Chuyên môn

- Công thức có khả thi không.
- Tỷ lệ có hợp lý không.
- Chẩn đoán có đúng nguyên nhân chính không.
- Giải pháp có cứu được món không.

### Bám dữ liệu

- Có dùng đúng sản phẩm thật không.
- Có gọi tool trước khi nói giá không.
- Có nhầm quy cách không.
- Có gợi ý sản phẩm đã ngừng bán không.

### Kinh doanh

- Cost có đúng không.
- Giá bán có hợp mô hình không.
- Có tối ưu dùng chéo nguyên liệu không.
- Có đưa lời khuyên đủ cụ thể để làm ngay không.

### Chất lượng hội thoại

- Có quyết đoán không.
- Có hỏi quá nhiều không.
- Có trả lời máy móc không.
- Có giải thích đánh đổi không.

### Bộ test ban đầu

Tạo tối thiểu 100 tình huống:

- 30 tạo/chỉnh công thức.
- 25 chẩn đoán lỗi.
- 20 scale và cost.
- 15 tư vấn kinh doanh.
- 10 câu cố tình gây nhầm sản phẩm hoặc giá.

---

## 14. Triển khai theo phase

### Phase A - Nền Công thức

- Schema recipes.
- Recipe CRUD.
- Gắn sản phẩm Catalog V2.
- Versioning.
- Scale bằng code.
- Cost bằng backend.
- Thêm nguyên liệu vào giỏ.

**Điều kiện hoàn thành:** Nhánh Công thức chạy được hoàn toàn khi AI tắt.

### Phase B - Agent proof of concept

- Tạo Google Cloud project/service account riêng.
- Dựng Culinary Expert Agent.
- Kết nối 5 tool đọc cơ bản.
- Thử create draft, review và hỏi đáp.
- Tạo prompt/persona phiên bản 1.
- Ghi log run/tool call.

**Điều kiện hoàn thành:** Agent biết suy luận rộng nhưng không bịa sản phẩm và giá.

### Phase C - AI cho admin

- Generate recipe draft.
- Review recipe.
- Rewrite từng phần.
- Gợi ý sản phẩm.
- Gợi ý lỗi thường gặp.
- Gợi ý kinh doanh theo mùa.
- Admin approval workflow.

**Ưu tiên cao nhất**, vì giúp tạo kho nội dung chất lượng nhanh.

### Phase D - AI cho khách

- Chat theo công thức.
- Scale công thức.
- Thay thế nguyên liệu.
- Chẩn đoán lỗi.
- Hỗ trợ ảnh món.
- Tư vấn giá bán và combo.

### Phase E - Agent kinh doanh

- Tư vấn mở menu.
- Menu theo vốn.
- Menu theo mùa/khu vực.
- Tận dụng nguyên liệu khách đã mua.
- Kế hoạch bán 7/30 ngày.

### Phase F - Tối ưu production

- Evaluation tự động.
- Prompt versioning.
- Model routing theo độ khó.
- Cache.
- Quota.
- Theo dõi chi phí.
- Dashboard tỷ lệ AI dẫn tới thêm giỏ/đặt hàng.

---

## 15. Model routing đề xuất

Không dùng một model đắt cho mọi request.

### Model nhanh

Dùng cho:

- Phân loại ý định.
- Tóm tắt hội thoại.
- Format JSON.
- Gợi ý câu hỏi.
- Các câu hỏi công thức đơn giản.

### Model mạnh

Dùng cho:

- Tạo công thức hoàn chỉnh.
- Phản biện công thức.
- Chẩn đoán lỗi phức tạp.
- Phân tích hình ảnh.
- Tư vấn mô hình kinh doanh.
- So sánh nhiều phương án.

Tên model cụ thể cấu hình bằng env/config để thay đổi mà không sửa logic.

---

## 16. Chỉ số thành công

- Tỷ lệ bản nháp AI được admin chấp nhận sau chỉnh sửa.
- Thời gian tạo một công thức hoàn chỉnh.
- Tỷ lệ câu trả lời dùng đúng sản phẩm.
- Tỷ lệ khách thêm nguyên liệu từ công thức vào giỏ.
- Doanh thu phát sinh từ trang công thức.
- Tỷ lệ chẩn đoán được người dùng đánh giá hữu ích.
- Chi phí AI trên mỗi phiên và trên mỗi đơn phát sinh.
- Tỷ lệ agent phải hỏi lại.
- Tỷ lệ tool call lỗi.

---

## 17. Quyết định chốt

1. Dùng Google Agent Platform/Agent Engine làm nền tảng agent.
2. Agent có nhân cách chuyên gia ẩm thực và được quyền suy luận rộng.
3. Không biến AI thành bộ đọc RAG máy móc.
4. Grounding nội bộ dùng để giữ đúng dữ liệu Bếp Sỉ, không thay thế kiến thức của model.
5. Quyền hạn được khóa ở tool và backend, không khóa khả năng tư duy bằng prompt dài đầy lệnh cấm.
6. Giá, sản phẩm, giỏ hàng và đơn hàng luôn do backend quyết định.
7. AI cho admin triển khai trước AI cho khách.
8. Công thức nền phải hoạt động độc lập khi AI không khả dụng.
9. Agent service tách khỏi backend đặt hàng khi lên production.
10. Mục tiêu cuối cùng không phải chatbot hay, mà là **công thức tốt hơn, khách làm món thành công hơn và Bếp Sỉ bán được nhiều nguyên liệu hơn**.

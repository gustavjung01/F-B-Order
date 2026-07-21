import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA_PATH = ROOT / "data" / "recipes" / "bepsi-recipes-v1" / "recipes.standard.json"

PUBLIC_FINALS = {
    "ca-phe-muoi-500ml": "Cà phê muối đạt khi cà phê còn hương rang, nền sữa cân bằng và lớp milk foam mặn phủ đều, mịn, không rỗ bọt lớn. Vị mặn chỉ làm nổi hương cà phê, không lấn át; giữ miệng ly sạch, không khuấy lại và giao ngay.",
    "ca-phe-kem-cheese-500ml": "Cà phê kem cheese đạt khi cà phê còn đậm hương rang, lớp kem cheese béo mặn nhẹ phủ kín mặt và hai lớp còn tách rõ. Không để kem chìm ngay, không lắc lại và giao khi nền vẫn đủ lạnh.",
    "cacao-kem-cheese-500ml": "Cacao kem cheese đạt khi nền cacao mịn, không lắng bột, màu nâu đồng nhất và lớp kem cheese phủ đều, không tách nước. Nếm mẫu để chắc vị cacao rõ nhưng không khét, sau đó đậy nắp mà không khuấy lại.",
    "matcha-kem-cheese-500ml": "Matcha kem cheese đạt khi nền matcha xanh mịn, không vón bột và lớp kem cheese tạo vị béo mặn cân bằng. Bề mặt kem phải phẳng, không rỗ bọt lớn, hai lớp còn tách rõ trước khi giao.",
    "tra-o-long-kem-cheese-500ml": "Trà ô long kem cheese đạt khi hương ô long vẫn rõ dưới lớp kem, nền trà không chát và kem cheese phủ đều, không chìm ngay. Kiểm tra ly đủ lạnh, miệng ly sạch và không lắc lại trước khi phục vụ.",
    "tra-lai-kem-cheese-500ml": "Trà lài kem cheese đạt khi hương lài thanh, nước trà sáng và lớp kem cheese béo mặn không che mất mùi hoa. Giữ hai lớp tách rõ, bề mặt kem mịn và giao ngay sau khi hoàn thiện.",
    "tra-dao-kem-cheese-500ml": "Trà đào kem cheese đạt khi vị đào chua ngọt rõ, miếng đào còn nguyên và lớp kem cheese phủ đều nhưng chưa hòa hoàn toàn vào trà. Nền phải đủ lạnh, không có hậu đắng và garnish đúng định lượng.",
    "tra-dau-kem-cheese-500ml": "Trà dâu kem cheese đạt khi mùi dâu rõ, mứt không đóng cục, lát dâu còn tươi và lớp kem cheese phủ kín mặt nước. Vị chua ngọt phải cân bằng, kem không tách nước và ly không bị tràn.",
    "tra-xoai-kem-cheese-500ml": "Trà xoài kem cheese đạt khi vị xoài chín rõ, xoài hạt lựu còn săn và lớp kem cheese đứng nhẹ trên mặt. Nền trà không bị đục bất thường, kem không chìm ngay và tổng thể tích đúng 500 ml.",
    "tra-sua-duong-den-tran-chau-500ml": "Trà sữa đường đen trân châu đạt khi vệt sốt bám rõ thành ly, trân châu còn ấm mềm và nền trà sữa không bị ngọt gắt. Kiểm tra hạt không cứng lõi, không chua và giao ngay để giữ độ dai.",
    "sua-tuoi-tran-chau-duong-den-500ml": "Sữa tươi trân châu đường đen đạt khi vệt sốt nâu đậm còn rõ, sữa tươi giữ vị sạch và trân châu ấm mềm, không dính cụm. Hai lớp phải còn phân tầng trước khi giao và không vượt vạch 500 ml.",
    "tra-sua-pudding-trung-500ml": "Trà sữa pudding trứng đạt khi pudding mềm, còn nguyên khối, không chua và nằm gọn dưới đáy ly. Nền trà sữa phải mượt, không có cặn bột; thử bằng ống hút lớn trước khi phục vụ.",
    "tra-sua-thach-3q-500ml": "Trà sữa thạch 3Q đạt khi thạch giòn dai, không dính thành cụm và hút qua ống lớn dễ dàng. Nền trà sữa đủ lạnh, không lắng cặn và tổng thể tích đúng 500 ml.",
    "tra-sua-tran-chau-trang-500ml": "Trà sữa trân châu trắng đạt khi hạt trong, giòn dai, không chua và phân bố đều dưới đáy ly. Hương trà lài vẫn rõ, nền sữa không quá ngọt và topping không dính cục.",
    "tra-sua-full-topping-500ml": "Trà sữa full topping đạt khi trân châu đen, pudding trứng và thạch 3Q đủ định lượng, tách rõ và đều còn đúng cấu trúc. Nền trà sữa phải mượt, đủ lạnh và các topping hút qua ống lớn mà không nghẹt.",
}

INTERNAL_FINALS = {
    "nen-tra-den": "Mẻ Nền trà đen đạt khi nước trà nâu đỏ trong, hương trà đen rõ và không có hậu khét hoặc chát gắt. Lấy mẫu bằng dụng cụ sạch để kiểm tra trước khi nhập quầy; dùng tốt nhất trong 8 giờ, tối đa 24 giờ ở 2–5°C.",
    "nen-tra-lai": "Mẻ Nền trà lài đạt khi nước trà vàng sáng, hương lài thanh và không có mùi ủ quá lâu. Lọc sạch cặn, ghi giờ hoàn thành và bảo quản kín ở 2–5°C theo thời gian sử dụng nội bộ.",
    "nen-tra-o-long": "Mẻ Nền trà ô long đạt khi nước trà vàng hổ phách, hương rang nhẹ và hậu vị sạch, không chát gắt. Ghi giờ hoàn thành, đậy kín và bảo quản lạnh theo thời gian sử dụng nội bộ.",
    "nen-tra-thai-xanh": "Mẻ Nền trà Thái xanh đạt khi màu xanh sáng, hương trà rõ và không có cặn lá mịn hoặc mùi khét. Đậy kín, ghi giờ hoàn thành và bảo quản ở 2–5°C.",
    "nen-tra-thai-do": "Mẻ Nền trà Thái đỏ đạt khi màu cam đỏ trong, hương trà rõ và không có vị khét hoặc chát kéo dài. Lọc sạch, ghi nhãn mẻ và bảo quản kín ở 2–5°C.",
    "nen-tra-sua-truyen-thong": "Mẻ Nền trà sữa truyền thống đạt khi màu nâu sữa đồng nhất, bề mặt mượt, không lắng bột và hương trà đen vẫn nhận ra sau vị sữa. Ghi giờ hoàn thành, làm lạnh nhanh và bảo quản kín.",
    "nen-tra-sua-o-long": "Mẻ Nền trà sữa ô long đạt khi màu be sáng, hỗn hợp mượt, không tách lớp và hương ô long còn rõ. Làm lạnh nhanh, ghi nhãn và bảo quản kín ở 2–5°C.",
    "tran-chau-den": "Mẻ Trân châu đen đạt khi hạt chín xuyên tâm, lõi không trắng, bề mặt bóng và còn độ dai khi nhai. Hạt không được chua, nhớt hoặc dính cục; dùng tốt nhất trong 4 giờ ở nhiệt độ phòng.",
    "tran-chau-duong-den": "Mẻ Trân châu đường đen đạt khi từng hạt áo sốt đều, thơm caramel, mềm dai và không dính thành khối. Loại bỏ nếu có mùi chua hoặc lõi cứng; ghi giờ hoàn thành và dùng trong ca quy định.",
    "kem-cheese": "Mẻ Kem cheese đạt khi kem sánh mượt, giữ vân nhẹ trên phới, vị béo mặn cân bằng và không tách nước. Đậy kín, ghi giờ đánh kem và giữ lạnh 2–5°C.",
    "milk-foam-man": "Mẻ Milk foam mặn đạt khi bọt nhỏ, mịn, chảy thành dải dày và vị mặn chỉ đủ làm nổi nền đồ uống. Không dùng nếu foam tách nước, có mùi chua hoặc xẹp hoàn toàn; bảo quản kín ở 2–5°C.",
    "pudding-trung": "Mẻ Pudding trứng đạt khi mặt mịn không rỗ, cắt miếng giữ cạnh nhưng vẫn mềm rung nhẹ. Không dùng nếu có mùi chua, rỉ nước hoặc bề mặt nhớt; ghi giờ nấu và bảo quản lạnh.",
    "thach-tra": "Mẻ Thạch trà đạt khi màu nâu trong, mùi trà rõ, cắt khối không vỡ vụn và không rỉ nước. Ghi giờ hoàn thành, đậy kín và bảo quản lạnh theo thời gian sử dụng nội bộ.",
    "thach-ca-phe": "Mẻ Thạch cà phê đạt khi màu nâu trong, hương cà phê rõ, mặt cắt mịn và không đắng khét. Không dùng nếu rỉ nước, chua hoặc bề mặt nhớt; bảo quản kín ở 2–5°C.",
    "sot-duong-den": "Mẻ Sốt đường đen đạt khi màu nâu đậm bóng, chảy thành dải liên tục và thơm caramel nhưng không có mùi cháy. Để nguội theo quy trình, đóng chai sạch, ghi giờ và bảo quản theo quy định nội bộ.",
    "nuoc-duong-tieu-chuan": "Mẻ Nước đường tiêu chuẩn đạt khi dung dịch trong, không còn tinh thể đường, không đục và không có mùi lạ. Để nguội, đóng chai sạch, ghi giờ hoàn thành và bảo quản kín.",
}


def main() -> None:
    document = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    for recipe in document["recipes"]:
        slug = recipe["slug"]
        if slug in PUBLIC_FINALS:
            recipe["steps"][-1]["content"] = PUBLIC_FINALS[slug]
        if slug in INTERNAL_FINALS:
            recipe["steps"][-1]["content"] = INTERNAL_FINALS[slug]
    DATA_PATH.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Applied {len(PUBLIC_FINALS)} public and {len(INTERNAL_FINALS)} internal final profiles")


if __name__ == "__main__":
    main()

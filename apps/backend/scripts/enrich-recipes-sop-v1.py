import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA_PATH = ROOT / "data" / "recipes" / "bepsi-recipes-v1" / "recipes.standard.json"


def add_quality_check(text: str, recipe_slug: str) -> str:
    low = text.lower()
    checks: list[str] = []

    if any(word in low for word in ("khuấy", "hòa", "đánh matcha", "pha nền", "pha sữa", "phối sữa")):
        if "matcha" in low or "matcha" in recipe_slug:
            checks.append("Dừng khi hỗn hợp xanh đồng nhất, không còn vón bột hoặc bọt lớn trên mặt.")
        elif any(word in low for word in ("bột", "chocolate", "cacao", "khoai môn")):
            checks.append("Miết sát thành ca và khuấy đến khi không còn hạt bột khô hoặc cặn ở đáy.")
        else:
            checks.append("Khuấy theo một chiều đến khi hỗn hợp đồng nhất, không còn lớp tách hoặc cặn ở đáy ca.")

    if "lắc" in low:
        checks.append("Giữ kín nắp bình, lắc dứt khoát theo chiều dọc; dừng khi thành bình lạnh đều và có lớp bọt mỏng.")

    if "xay" in low:
        checks.append("Dừng máy khi hỗn hợp chảy thành dòng liên tục, không còn viên đá lớn và không bị tách nước.")

    if any(word in low for word in ("rót ra ly", "rót vào ly", "rót ra", "hoàn thiện")):
        checks.append("Rót sát thành ly để hạn chế bọt, giữ miệng ly sạch và không để nguyên liệu vượt vạch dung tích.")

    if any(word in low for word in ("phủ kem cheese", "phủ milk foam", "phủ kem")):
        checks.append("Rót lớp kem chậm ở giữa ly để lớp phủ dày đều, không chìm ngay xuống nền nước.")

    if any(word in low for word in ("tạo tầng", "rót matcha lên trên", "rót cà phê lên trên")):
        checks.append("Rót chậm qua mặt sau muỗng hoặc sát thành ly để hai lớp tách rõ trước khi giao khách.")

    if any(word in low for word in ("thêm nước đường", "cân vị", "phối vị")):
        checks.append("Khuấy 8–10 giây rồi nếm một mẫu nhỏ; vị chính phải rõ nhưng không gắt ngọt hoặc chua gắt.")

    if any(word in low for word in ("thêm topping", "chuẩn bị topping", "cho trân châu", "cho pudding", "cho thạch")):
        checks.append("Topping phải ráo vừa, còn độ dai hoặc mềm đặc trưng và không có mùi chua hay nhớt bất thường.")

    if any(word in low for word in ("ủ trà", "ủ vị", "đậy nắp và ủ")):
        checks.append("Bấm giờ ngay khi nước chạm trà; không kéo dài thời gian ủ vì nền sẽ chát và mất hương.")

    if any(word in low for word in ("lọc", "lọc trà")):
        checks.append("Để nước trà tự chảy hết qua lọc, không bóp hoặc ép xác trà.")

    if any(word in low for word in ("làm nguội", "bảo quản lạnh")):
        checks.append("Chuyển sang dụng cụ sạch có nắp, ghi giờ hoàn thành và đưa về 2–5°C càng sớm càng tốt.")

    if any(word in low for word in ("đun", "nấu", "sôi")):
        checks.append("Khuấy sát đáy để không khét; hạ lửa ngay khi đạt nhiệt hoặc độ sánh yêu cầu.")

    if not checks:
        checks.append("Thực hiện đúng định lượng và kiểm tra trạng thái nguyên liệu trước khi chuyển sang bước tiếp theo.")

    return f"{text.strip()} {checks[0]}"


def public_final_check(slug: str) -> str:
    if "da-xay" in slug or "tuyet" in slug:
        return (
            "Kiểm tra thành phẩm phải mịn, sánh đều, không còn đá cục và không tách nước sau 1 phút. "
            "Lau sạch miệng ly, đậy nắp và giao ngay để tránh tan đá."
        )
    if "kem-cheese" in slug or "ca-phe-muoi" in slug:
        return (
            "Kiểm tra nền nước đủ lạnh, lớp kem hoặc foam phủ đều và còn tách lớp. "
            "Lau sạch miệng ly, đậy nắp chắc và giao ngay; không lắc lại sau khi phủ kem."
        )
    if any(word in slug for word in ("duong-den", "matcha-latte", "sua-tuoi-matcha", "bac-xiu")):
        return (
            "Kiểm tra các lớp còn phân tầng rõ, topping nằm đúng vị trí và tổng thể tích đúng ly 500 ml. "
            "Đối chiếu mẫu trình bày trước khi đậy nắp và giao ngay."
        )
    return (
        "Nếm một mẫu nhỏ trước khi giao: hương chính phải rõ, vị ngọt và chua cân bằng, không có cặn bột hoặc mùi lạ. "
        "Kiểm tra đúng dung tích 500 ml, lau sạch miệng ly, đậy nắp và phục vụ ngay."
    )


def enrich_recipe(recipe: dict) -> None:
    original_steps = recipe.get("steps", [])
    new_steps: list[dict] = []

    if recipe.get("visibility") == "public":
        ingredient_names = ", ".join(item["productName"] for item in recipe.get("ingredients", [])[:4])
        new_steps.append(
            {
                "stepNo": 1,
                "title": "Chuẩn bị và kiểm tra nguyên liệu",
                "content": (
                    f"Cân đủ nguyên liệu theo công thức, ưu tiên chuẩn bị {ingredient_names}. "
                    "Kiểm tra nền pha đúng mẻ, đá khô sạch, topping còn hạn dùng và dụng cụ không có mùi lạ."
                ),
            }
        )

        for index, step in enumerate(original_steps, start=2):
            new_steps.append(
                {
                    "stepNo": index,
                    "title": step.get("title") or f"Bước {index}",
                    "content": add_quality_check(step.get("content", ""), recipe["slug"]),
                }
            )

        new_steps.append(
            {
                "stepNo": len(new_steps) + 1,
                "title": "Kiểm tra thành phẩm và phục vụ",
                "content": public_final_check(recipe["slug"]),
            }
        )
    else:
        new_steps.append(
            {
                "stepNo": 1,
                "title": "Vệ sinh và chuẩn bị mẻ",
                "content": (
                    "Vệ sinh tay, dụng cụ và bề mặt thao tác; cân đủ nguyên liệu theo công thức. "
                    "Dùng dụng cụ khô sạch, kiểm tra nguyên liệu còn hạn và chuẩn bị nhãn ghi giờ hoàn thành."
                ),
            }
        )

        for index, step in enumerate(original_steps, start=2):
            new_steps.append(
                {
                    "stepNo": index,
                    "title": step.get("title") or f"Bước {index}",
                    "content": add_quality_check(step.get("content", ""), recipe["slug"]),
                }
            )

        notes = " ".join(recipe.get("operationalNotes", [])).strip()
        storage = notes or (
            "Đậy kín, ghi tên mẻ và giờ hoàn thành; bảo quản theo nhiệt độ phù hợp. "
            "Loại bỏ nếu có mùi lạ, tách lớp bất thường hoặc quá thời gian sử dụng nội bộ."
        )
        new_steps.append(
            {
                "stepNo": len(new_steps) + 1,
                "title": "Kiểm tra mẻ và ghi nhãn",
                "content": (
                    "Đối chiếu màu, mùi, độ trong hoặc độ sánh với mẫu chuẩn trước khi đưa vào sử dụng. "
                    f"{storage}"
                ),
            }
        )

    recipe["steps"] = new_steps


def main() -> None:
    document = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    for recipe in document["recipes"]:
        enrich_recipe(recipe)
    DATA_PATH.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {len(document['recipes'])} recipes and {sum(len(r['steps']) for r in document['recipes'])} steps")


if __name__ == "__main__":
    main()

import json
import subprocess
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA_PATH = ROOT / "data" / "recipes" / "bepsi-recipes-v1" / "recipes.standard.json"
ORIGINAL_REF = "7ec31af:data/recipes/bepsi-recipes-v1/recipes.standard.json"


def ingredient_names(recipe: dict) -> list[str]:
    return [item["productName"] for item in recipe.get("ingredients", [])]


def prep_text(recipe: dict) -> str:
    title = recipe["title"]
    items = ingredient_names(recipe)
    listed = ", ".join(items[:4])
    if recipe["visibility"] == "public":
        return (
            f"Chuẩn bị riêng cho {title}: cân {listed} đúng định lượng và xếp theo thứ tự sử dụng. "
            "Kiểm tra nguyên liệu còn hạn, không có mùi hoặc màu bất thường; đá phải khô sạch, dụng cụ không ám mùi và ly 500 ml nguyên vẹn."
        )
    return (
        f"Chuẩn bị mẻ {title}: vệ sinh dụng cụ, bề mặt thao tác và hộp chứa; cân riêng {listed}. "
        "Kiểm tra nguyên liệu còn hạn, dụng cụ khô sạch và chuẩn bị nhãn ghi tên mẻ cùng giờ hoàn thành."
    )


def final_text(recipe: dict) -> str:
    title = recipe["title"]
    items = ingredient_names(recipe)
    main = items[0] if items else title
    secondary = items[1] if len(items) > 1 else "các thành phần còn lại"
    slug = recipe["slug"]

    if recipe["visibility"] == "internal":
        notes = " ".join(recipe.get("operationalNotes", [])).strip()
        storage = notes or "Đậy kín, ghi giờ hoàn thành và bảo quản theo quy định nội bộ."
        return (
            f"Mẻ {title} đạt khi màu, mùi và cấu trúc đúng đặc trưng của {main}, không có cặn lạ, mùi chua hoặc dấu hiệu tách nước bất thường. "
            f"Lấy mẫu bằng dụng cụ sạch để kiểm tra trước khi nhập quầy; {storage}"
        )

    if "da-xay" in slug or "tuyet" in slug:
        return (
            f"{title} đạt khi hương {main} rõ, hỗn hợp mịn và sánh, không còn đá cục hoặc tách nước sau 1 phút. "
            f"Vị của {secondary} phải hòa đều, tổng thể tích đúng 500 ml; lau sạch miệng ly và giao ngay."
        )
    if "kem-cheese" in slug or "ca-phe-muoi" in slug:
        return (
            f"{title} đạt khi nền {main} đủ lạnh, lớp {secondary} phủ đều, còn tách lớp và không có bọt lớn. "
            "Nếm mẫu nhỏ để kiểm tra vị béo mặn cân bằng, giữ miệng ly sạch và không lắc lại trước khi giao."
        )
    if "duong-den" in slug or "bac-xiu" in slug or "matcha-latte" in slug or "sua-tuoi-matcha" in slug:
        return (
            f"{title} đạt khi các lớp còn phân tầng rõ, {main} và {secondary} không lẫn đục trước khi phục vụ. "
            "Kiểm tra đúng thể tích 500 ml, màu sắc đúng mẫu và topping còn trạng thái đặc trưng."
        )
    if slug.startswith("tra-") and not slug.startswith("tra-sua-"):
        return (
            f"{title} đạt khi hương {main} còn rõ, vị của {secondary} cân bằng, nước trà sáng và không có hậu đắng bất thường. "
            "Garnish phải tươi, đá đủ lạnh và tổng thể tích đúng 500 ml trước khi đậy nắp."
        )
    return (
        f"{title} đạt khi hương {main} rõ, {secondary} hòa đều, màu sắc đồng nhất và không có cặn hoặc mùi lạ. "
        "Nếm một mẫu nhỏ để kiểm tra độ ngọt, độ lạnh và đúng thể tích 500 ml trước khi phục vụ."
    )


def specialize_duplicate(recipe: dict, step: dict) -> str:
    title = recipe["title"]
    text = step["content"].strip()
    if text == "Rót ra ly và phủ kem cheese.":
        return (
            f"Rót phần nền {title} sát thành ly, chừa đúng khoảng trống cho kem cheese. "
            "Phủ kem từ giữa ra ngoài thành lớp kín, giữ bề mặt phẳng và không để kem chìm ngay."
        )
    if text == "Lắc với đá 10 giây.":
        return (
            f"Cho phần {title} đã phối vị vào bình cùng đá, khóa kín nắp và lắc dọc 10 giây. "
            "Dừng khi thành bình lạnh đều và chỉ có lớp bọt mỏng."
        )
    if text == "Lắc trà sữa với đá.":
        return (
            f"Cho nền {title} cùng đá vào bình, lắc dứt khoát đến khi thành bình lạnh đều. "
            "Không lắc quá lâu làm loãng nền; kiểm tra trà sữa vẫn mượt trước khi rót lên topping."
        )
    if text == "Rót ra ly 500 ml.":
        return (
            f"Rót {title} vào ly 500 ml theo dòng chậm, vét sạch phần còn bám trong ca nhưng không ép bọt lên miệng ly. "
            "Giữ tổng thể tích đúng vạch và lau sạch thành ngoài."
        )
    if text == "Thêm sữa tươi, lắc với đá.":
        return (
            f"Thêm sữa tươi vào phần nền của {title}, khuấy sơ rồi lắc cùng đá đến khi lạnh đều. "
            "Kiểm tra màu đồng nhất và không còn cặn dưới đáy bình trước khi rót."
        )
    if text == "Phủ kem cheese.":
        return (
            f"Giữ ly {title} đứng yên, rót kem cheese chậm ở tâm rồi xoay nhẹ để phủ đều mặt nước. "
            "Lớp kem phải dày đồng nhất và không chảy tràn miệng ly."
        )
    return text


def main() -> None:
    current = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    original = json.loads(
        subprocess.check_output(["git", "show", ORIGINAL_REF], cwd=ROOT).decode("utf-8")
    )
    original_by_slug = {recipe["slug"]: recipe for recipe in original["recipes"]}
    original_contents = [
        step["content"].strip()
        for recipe in original["recipes"]
        for step in recipe.get("steps", [])
    ]
    duplicated_original = {
        text for text, count in Counter(original_contents).items() if count > 1
    }

    for recipe in current["recipes"]:
        source = original_by_slug[recipe["slug"]]
        rebuilt = [
            {
                "stepNo": 1,
                "title": "Chuẩn bị và kiểm tra nguyên liệu"
                if recipe["visibility"] == "public"
                else "Vệ sinh và chuẩn bị mẻ",
                "content": prep_text(recipe),
            }
        ]
        for source_step in source.get("steps", []):
            content = source_step["content"].strip()
            if content in duplicated_original:
                content = specialize_duplicate(recipe, source_step)
            rebuilt.append(
                {
                    "stepNo": len(rebuilt) + 1,
                    "title": source_step["title"],
                    "content": content,
                }
            )
        rebuilt.append(
            {
                "stepNo": len(rebuilt) + 1,
                "title": "Kiểm tra thành phẩm và phục vụ"
                if recipe["visibility"] == "public"
                else "Kiểm tra mẻ và ghi nhãn",
                "content": final_text(recipe),
            }
        )
        recipe["steps"] = rebuilt

    contents = [
        step["content"].strip()
        for recipe in current["recipes"]
        for step in recipe.get("steps", [])
    ]
    duplicates = [text for text, count in Counter(contents).items() if count > 1]
    if duplicates:
        raise SystemExit(f"Duplicated contents remain: {len(duplicates)}")

    DATA_PATH.write_text(
        json.dumps(current, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Rebuilt {len(current['recipes'])} recipes with {len(contents)} unique steps")


if __name__ == "__main__":
    main()

# LOCAL SETUP - Kết nối repo với máy local

Local dự án:

```powershell
F:\1_A_Disk_D\F&B-Order
```

Repo GitHub:

```txt
https://github.com/gustavjung01/F-B-Order.git
```

## Cách dùng khuyến nghị

Dùng cách này khi thư mục local đã có file gốc và muốn kết nối với repo hiện tại, không clone đè.

```powershell
cd "F:\1_A_Disk_D\F&B-Order"

git init
git branch -M main

git remote remove origin 2>$null
git remote add origin https://github.com/gustavjung01/F-B-Order.git

git status
```

Nếu local có file cần đưa lên commit trước:

```powershell
git add .
git commit -m "local: initial source"
```

Nếu Git báo `nothing to commit`, bỏ qua bước commit.

## Kéo khung repo trên GitHub về local

```powershell
git fetch origin main
git pull origin main --allow-unrelated-histories --no-rebase
```

## Nếu có conflict

Xem file bị conflict:

```powershell
git status
```

Sửa conflict trong file, sau đó:

```powershell
git add .
git commit -m "merge: connect local with remote scaffold"
git push -u origin main
```

## Nếu không có conflict

```powershell
git push -u origin main
```

## Sau khi đã kết nối xong

Các lần sau chỉ cần:

```powershell
git pull
git add .
git commit -m "update: work in progress"
git push
```

## Lưu ý

- Không clone đè vào thư mục local đang có file gốc.
- Không tạo backup trong repo.
- Không commit file `.env`.
- Nếu có file nhạy cảm trong local, kiểm tra bằng `git status` trước khi commit.

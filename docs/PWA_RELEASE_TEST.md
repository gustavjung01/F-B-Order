# PWA release test for Bep Si F&B

Muc tieu: khach khong phai go PWA va cai lai sau moi lan deploy.

## Bat buoc truoc khi release

- Build thanh cong.
- Vercel deploy dung commit moi nhat.
- `/app-version.json` doi version sau moi build.
- `/service-worker.js` tra ve ban moi, khong bi 404.
- `/manifest.webmanifest` tra ve hop le.

## Test tren Chrome desktop

1. Mo web bang Chrome.
2. DevTools -> Application -> Service Workers.
3. Confirm service worker registered.
4. Hard reload 2 lan.
5. Chuyen qua `/account`, `/register`, `/cart`, `/recipes`.
6. UI khong duoc reload bat ngoai y muon.
7. UI khong duoc giat khi scroll.
8. DevTools Console khong co error service worker lap lai.

## Test update

1. Cai PWA tren Chrome.
2. Mo PWA.
3. Deploy commit moi.
4. Mo lai PWA.
5. App chi duoc hien popup update, khong tu reload giua thao tac.
6. Bam `Cap nhat ngay`.
7. App reload 1 lan va vao ban moi.
8. Dong mo lai PWA, khong hien popup lap lai neu da cap nhat.

## Test mobile Android

1. Mo Chrome Android.
2. Cai PWA ra home screen.
3. Mo PWA va scroll home/product/account.
4. Header khong duoc an hien giat.
5. Bottom nav khong che nut chinh.
6. Deploy commit moi.
7. Mo lai PWA.
8. Chi hien popup update, khong tu reload bat ngo.
9. Bam update, app reload 1 lan.

## Test iPhone Safari

1. Mo Safari.
2. Add to Home Screen.
3. Mo PWA tu icon.
4. Kiem tra `/`, `/account`, `/register`.
5. Khong co giat header.
6. Khong bi vang trang sau khi mo lai.
7. Sau deploy moi, mo lai PWA va kiem tra popup update.

## Khong dat release neu co cac loi nay

- Moi lan mo PWA tu reload lien tuc.
- Service worker controllerchange reload khi user chua bam update.
- Header an hien theo scroll gay nhay layout.
- PWA can go ra cai lai moi thay UI moi.
- `/app-version.json` khong doi sau build.
- `/service-worker.js` bi cache sai.

## Ghi chu ky thuat hien tai

- Trang HTML dung network-first trong service worker.
- Static asset dung stale-while-revalidate.
- Service worker chi reload khi user bam update.
- Update check bi throttle 10 phut, tru luc co SW update ready.

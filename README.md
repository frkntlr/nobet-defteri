# Nöbet Defteri

Yurt ve gözetim ekipleri için 12 saatlik vardiya çizelgesi. Sabah 07:00–19:00, gece 19:00–07:00.

Vardiya önceliği:

1. Her sabah ve her gece en az **1 erkek**
2. Herkes ayda en az **15 gün** çalışır
3. Mümkünse **2 iş / 2 off**
4. Olabiliyorsa gece **2 erkek**

Elle hücre değiştirseniz bile o ayın kilitli olmayan günleri bu sıraya göre yeniden ayarlanır.

Personel tipinde **Seçili günler (sabah)** vardır: Pazartesi–Pazar kutularından “şu günler gelsin, diğerleri gelmesin” denir. **Özel iş ritmi** (2 iş / 2 off) açık olsa bile işaretlenen günler sabah yazılır; diğer günler off kalır. Sabit sabahçıya da aynı gün kutuları verilebilir.

## Erkek gece kuralı

Erkek bölümünde **o ayın her gecesinde en az 1 kişi** olmalıdır. Sistem:

- Açık geceyi mümkünse doldurur (off’taki veya sabah→gece geçişine uyan erkeklerle).
- Elle hücre değiştirseniz bile kural durur: son erkeği geceden çıkarırsanız çizelge kırmızı uyarı verir, boş gün sütununu işaretler ve hücre penceresinde uyarır.
- Bütün erkekler o gece izinliyse yine uyarır; izin kaydı silinmeden gece boş bırakılmaz gibi görünür.

## Çalıştırma

```bash
npm install
npm run dev
```

Tarayıcıda [http://127.0.0.1:43123](http://127.0.0.1:43123) açılır.

```bash
npm test          # çizelge ve erkek gece kuralı
npm run build     # üretim derlemesi
```

Veriler tarayıcı `localStorage` anahtarı `nobet-defteri-v1` içinde tutulur. Kaydet / Dışa aktar ile JSON yedek alın, İçe aktar ile geri yükleyin.

## Kullanım

1. **Personel** — erkek/bayan, dönen veya sabit sabah/gece. Etiket eklenir, adı değiştirilir, kişiye yapıştırılır.
2. **İzinler** — yıllık, normal, günlük, rapor, istirahat, ücretsiz.
3. **Çizelge** — hücreye tıklayıp sabah / gece / off / yoklama yazın. Elle kilitlenen hücreler siyah çerçevelidir.
4. **Ayarlar** — erkek sabah/gece tabanı (1, sıfırlanamaz), hedef 2 gece, imza yetkilileri (pasif yapılabilir), resmi tatiller.

Excel ve PDF çıktının altında Ayarlar’daki yetkililer basılır.

## Yayın (Vercel)

GitHub: [https://github.com/frkntlr/nobet-defteri](https://github.com/frkntlr/nobet-defteri)

Hedef adres: [https://nobet-defter2.vercel.app/](https://nobet-defter2.vercel.app/)

İlk yayın için Cursor’daki **Publish** düğmesine bir kez basılır; proje adı **nobet-defter2** olmalıdır. Vercel bu depoyu bağlar. Bundan sonra `main`’e giden her push canlıyı günceller. Kökteki `vercel.json` Vite derlemesini ve SPA yönlendirmesini tanımlar.

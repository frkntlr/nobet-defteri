# Nöbet Defteri

Yurt ve gözetim ekipleri için 12 saatlik vardiya çizelgesi. Sabah 07:00–19:00, gece 19:00–07:00. Dönen personel **2 gün iş / 2 gün off** ritminde yürür ve ayda en az 15 gün çalışır. Elle değişiklik bu ritmi bozarsa sistem kilitli olmayan günleri geri çeker.

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

1. **Personel** — erkek/bayan, dönen veya sabit sabah/gece.
2. **İzinler** — yıllık, normal, günlük, rapor, istirahat, ücretsiz.
3. **Çizelge** — hücreye tıklayıp sabah / gece / off / yoklama yazın. Elle kilitlenen hücreler siyah çerçevelidir.
4. **Ayarlar** — en az erkek gece (taban 1, sıfırlanamaz), hedef 2 gece, imza yetkilileri, resmi tatiller.

Excel ve PDF çıktının altında Ayarlar’daki yetkililer basılır.

## Yayın (Vercel)

GitHub: [https://github.com/frkntlr/nobet-defteri](https://github.com/frkntlr/nobet-defteri)

Hedef adres: [https://nobet-defteri.vercel.app/](https://nobet-defteri.vercel.app/)

İlk yayın için Cursor’daki **Publish** düğmesine bir kez basılır; Vercel bu depoyu bağlar. Bundan sonra `main`’e giden her push canlıyı günceller. Kökteki `vercel.json` Vite derlemesini ve SPA yönlendirmesini tanımlar.

Var olan `nobet-defteri` projesini kullanmak için Vercel’de o projenin Git kaynağına bu depoyu verin.

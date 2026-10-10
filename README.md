# Notebase

İçerik üreticileri ve video editörleri için Milanote tarzı görsel çalışma alanı. Notlar, planlar, görseller,
videolar, storyboard ve müşteri işleri tek bir sonsuz tuvalde — kartları kablolarla birbirine bağlayabilirsin.

## Çalıştırma

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ klasörüne statik site üretir
```

## Özellikler

- **Sonsuz tuval** — kaydır, yakınlaştır (⌘/Ctrl + tekerlek), mini harita, kutu seçimi (Shift + sürükle)
- **Kart tipleri** — Not, Liste (to-do), Başlık, Görsel, Video (dosya / YouTube / Vimeo), Bağlantı,
  Sahne (storyboard: çekim tipi, süre, ses, kare), İş (müşteri, teslim tarihi, ücret, durum), Renk, Bölüm, Pano
- **İç içe panolar** — Pano kartına çift tıklayıp içine gir; sol menüde ağaç, üstte yol (breadcrumb)
- **Bağlantılar** — kart kenarındaki noktadan tutup başka karta sürükle
- **Sürükle-bırak & yapıştır** — görsel/video dosyaları, linkler ve metin direkt karta dönüşür
- **Bölümler** — bölümü taşıyınca içindeki kartlar da taşınır
- **İşlerim paneli (⌘J)** — tüm panolardaki İş kartları teslim tarihine göre; gecikmiş, ödeme bekleyen, tahsil edilen
- **Arama (⌘K)** — tüm panolarda ve kartlarda; sonuca tıklayınca karta uçar
- **Şablonlar** — Video prodüksiyon, İçerik takvimi, Moodboard, Müşteri işi
- **Geri al / yinele**, çoğalt (⌘D), sil (Delete)
- **Yerel ve otomatik kayıt** — her şey tarayıcının IndexedDB'sinde; **Yedekle / Geri yükle** ile tek JSON dosyası

## Kısayollar

| Tuş | İşlem | Tuş | İşlem |
| --- | --- | --- | --- |
| N | Not | S | Sahne |
| L | Liste | J | İş |
| H | Başlık | C | Renk |
| I | Görsel | F | Bölüm |
| V | Video | B | Pano |
| K | Bağlantı | Çift tık | Yeni not |
| ⌘K | Ara | ⌘J | İşlerim |
| ⌘Z / ⇧⌘Z | Geri al / yinele | ⌘D | Çoğalt |

## Teknoloji

React + TypeScript + Vite, [React Flow](https://reactflow.dev) (tuval), Zustand (durum), idb-keyval (IndexedDB).

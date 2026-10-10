# Notebase

İçerik üreticileri ve video editörleri için Milanote tarzı görsel çalışma alanı. Notlar, planlar, görseller,
videolar, storyboard ve müşteri işleri tek bir sonsuz tuvalde. Kartları kablolarla birbirine bağlayabilir,
panoları müşterine ya da bir yapay zekâya link olarak verebilirsin.

## Çalıştırma

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ klasörüne statik site üretir
```

Bulut ayarı yapılmadan da tam çalışır; o durumda her şey sadece kullandığın tarayıcıda durur.

## Özellikler

- **Sonsuz tuval**: kaydır, yakınlaştır (⌘/Ctrl + tekerlek, telefonda iki parmak), mini harita, kutu seçimi (Shift + sürükle)
- **Arka plan**: noktalar, ızgara ya da düz (boş alana sağ tık → Arka plan)
- **Kart tipleri**: Not, Liste, Başlık, Görsel, Video, Bağlantı, Sahne (storyboard), İş (müşteri, teslim, ücret, durum), Renk,
  Bölüm, Pano
- **Sağ tık menüsü**: kartta çoğalt, metni kopyala, renk, öne/arkaya al, bağlantıları kaldır, sil. Bağlantıda etiket, ok ucu, sil.
  Boş alanda "buraya ekle".
- **Seçili kart çubuğu**: kart seçilince üstünde çoğalt / sil / diğer. Telefonda da çalışır.
- **Video yorumları**: videoyu durdur, yorum yaz; o saniyeye bağlanır. Yoruma tıklayınca video o ana atlar. Yüklenen videolarda,
  YouTube'da ve Vimeo'da çalışır.
- **İç içe panolar**, **İşlerim paneli (⌘J)**, **arama (⌘K)**, **şablonlar**, **geri al / yinele**
- **Bulut senkronu**: giriş yapınca panolar, görseller ve videolar her cihazda aynı. İnternet yokken de çalışır, bağlantı
  gelince gönderir.
- **Paylaşım**: müşteri linki (salt okunur tuval, videolara zaman damgalı yorum bırakabilirler) ve yapay zekâ linki (tüm içerik
  düz sayfa / Markdown olarak)
- **Yapay zekâya ver**: Paylaş → "Metin olarak kopyala" panoyu bölümleri, kartları ve oklarıyla düzenli metne çevirir
- **Uygulama olarak yükle**: telefonda ana ekrana, bilgisayarda masaüstüne. Android'de başka uygulamalardan "Paylaş → Notebase"
  ile link gönderilebilir.

## Bulutu bağlama (bir kez, ~5 dakika)

Bulut için ücretsiz bir [Supabase](https://supabase.com) projesi kullanılır.

1. **supabase.com** → _Start your project_ → GitHub ile giriş → **New project**. İsim: `notebase`, bir veritabanı şifresi belirle,
   bölge olarak _Central EU (Frankfurt)_ seç.
2. Proje açılınca sol menüden **SQL Editor** → _New query_ → bu repodaki [`supabase/schema.sql`](supabase/schema.sql) dosyasının
   tamamını yapıştır → **Run**. "Success" görmelisin.
3. **Authentication → Sign In / Providers → Email** kısmında **Confirm email** seçeneğini kapat. (Açık kalacaksa
   **Authentication → URL Configuration → Site URL** alanına site adresini, ör. `https://note-base-wine.vercel.app`, yaz.)
4. **Project Settings → API Keys** (ya da _Data API_) sayfasından **Project URL** ve **anon / publishable key** değerlerini kopyala.
5. **Vercel** → projen → **Settings → Environment Variables** kısmına ekle:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` (ya da `VITE_SUPABASE_PUBLISHABLE_KEY`) = anon / publishable key

   Sonra **Deployments** → en üstteki yayın → **⋯ → Redeploy**.
6. Siteye gir → sol alttaki **Bulut senkronu** → **Hesap oluştur**.
7. Kendi hesabını açtıktan sonra başkalarının hesap açmasını kapat: Supabase → **Authentication → Sign In / Providers** →
   **Allow new users to sign up** kapalı.

Vercel'in Supabase entegrasyonunu (Vercel → Storage → Supabase) kullanırsan anahtarlar `NEXT_PUBLIC_SUPABASE_...` adıyla
otomatik eklenir; uygulama bunları da tanır. 2. ve 3. adımları yine yapman gerekir.

**Ücretsiz plan sınırları:** dosya başına 50 MB, toplam 1 GB depolama. Daha büyük videolar sadece yüklendiği cihazda kalır.
Uzun videolar için YouTube (liste dışı) / Vimeo linki eklemek en iyisi. Ücretsiz projeler bir hafta hiç kullanılmazsa
duraklatılır; Supabase panelinden tek tıkla geri açılır.

**Gizlilik:** Panolar sadece senin hesabınla okunabilir. Paylaşım linki açtığın pano ve alt panoları, linki bilen herkes
görebilir; paylaşımı kapatınca link çalışmaz. Yüklenen görsel/videoların adresleri tahmin edilemez ama herkese açıktır: link
paylaşımı ve yapay zekâ okuması bu sayede çalışıyor.

## Paylaşım linkleri

| Link | Ne işe yarar |
| --- | --- |
| `/?share=<id>` | Müşteri görünümü: tuval, salt okunur, video yorumu bırakılabilir |
| `/s/<id>` | Sunucuda oluşturulan düz sayfa: insanlar, link önizlemeleri ve yapay zekâ araçları JavaScript çalıştırmadan okur |
| `/s/<id>/md` | Aynı içerik Markdown olarak |
| `/s/<id>/json` | Ham veri |

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
| ⌫ / Delete | Seçiliyi sil | Sağ tık | Menü |

## Teknoloji

React + TypeScript + Vite, [React Flow](https://reactflow.dev) (tuval), Zustand (durum), IndexedDB (cihazdaki kayıt),
Supabase (hesap, veritabanı, dosyalar), Vercel Edge Function (`api/share.ts`, paylaşım sayfası).

Senkron "çevrimdışı öncelikli" çalışır: uygulama her zaman cihazdaki kayıttan okur, değişiklikler arkada buluta gider. Her pano tek
satırdır ve en son değiştirilen sürüm geçerli olur. İki cihazda aynı panoyu aynı anda düzenlersen sonra kaydedilen kazanır.

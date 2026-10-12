# Mağazaya yerleştirme rehberi

Bu belge FluentContext Pro'yu Chrome Web Store, Microsoft Edge Add-ons, Firefox Add-ons (AMO) ve
Opera Add-ons'a göndermek için gereken her şeyi toplar. Gönderim henüz yapılmadı; burada hazırlık ve
karar noktaları var.

## 1. Mağazalar bir bakışta

| Mağaza | Hesap | Yüklenecek dosya | İnceleme |
|---|---|---|---|
| Chrome Web Store | Tek seferlik 5 USD geliştirici kaydı | `fluentcontext-pro-<sürüm>-chromium.zip` | Birkaç gün; tüm sitelere erişim izni ayrıntılı incelemeye girer |
| Microsoft Edge Add-ons | Ücretsiz (Partner Center) | `…-chromium.zip` | 1–7 iş günü |
| Firefox Add-ons (AMO) | Ücretsiz | `…-firefox.zip` | Otomatik denetim + insan incelemesi |
| Opera Add-ons | Ücretsiz | `…-chromium.zip` | Elle inceleme, genelde birkaç gün |
| Safari | Apple Developer Program, yıllık 99 USD | Xcode ile dönüştürme gerekir | Bu projede denenmedi |

Paketler `npm run package` ile `dist/` klasörüne üretilir. GitHub'da her `v*` etiketinde Release iş akışı
aynı dosyaları sürüm sayfasına yükler.

## 2. Göndermeden önce kontrol listesi

1. **Eklenti kimliği (Firefox):** `package.json` içindeki `fluentcontext.geckoId` değerini kendi alan adınızla
   değiştirin. Örnek: `fluentcontext-pro@alanadiniz.com`. İlk gönderimden sonra bu kimlik değiştirilemez.
   Kendinden barındırılan sürüm için `geckoIdSelfHosted` ayrı kalmalı.
2. **Gizlilik politikası adresi:** [PRIVACY.md](../PRIVACY.md) herkese açık bir adreste yayınlanmalı. GitHub'da
   deponun dosya bağlantısı veya GitHub Pages yeterli. Chrome ve Edge bu adresi zorunlu tutuyor.
3. **Destek adresi:** GitHub Issues bağlantısı veya bir e-posta adresi.
4. **Sürüm:** `npm run release -- minor` gibi bir komutla artırılmış, CHANGELOG'da notu olan bir sürüm.
5. **Doğrulama:** `npm run verify` temiz geçmeli. Bu komut statik kontrolleri, birim testlerini, paketlemeyi
   ve gerçek Chrome'da uçtan uca testi çalıştırır. Firefox için `npm run lint:firefox` sıfır uyarı vermeli.
6. **Görseller:** `npm run screenshots` komutu `docs/store/images/` altına mağaza görsellerini üretir.
7. **Mağaza metinleri:** [store/listing.md](store/listing.md) dosyasındaki İngilizce ve Türkçe metinler.

## 3. Görseller

| Görsel | Boyut | Dosya |
|---|---|---|
| Simge | 128×128 | `icons/icon128.png` |
| Ekran görüntüleri | 1280×800 | `docs/store/images/screenshot-1…4.png` |
| Küçük tanıtım görseli (Chrome) | 440×280 | `docs/store/images/promo-small-440x280.png` |
| Geniş tanıtım görseli (Chrome, isteğe bağlı) | 1400×560 | `docs/store/images/promo-marquee-1400x560.png` |

Ekran görüntüleri gerçek eklentiden üretilir: Windows, macOS ve Linux görünümleri ile ayarlar sayfası.
Arayüz değiştiğinde komutu yeniden çalıştırmanız yeterli.

## 4. Kategori ve dil

- **Kategori:** Chrome'da "Productivity → Tools", Edge'de "Productivity", Firefox'ta "Other" veya "Appearance".
- **Liste dilleri:** İngilizce ve Türkçe metinler hazır. Arayüz 6 dil destekliyor, bu yüzden liste sayfasında
  "English, Türkçe, Deutsch, Français, Español, Русский" desteklendiğini belirtebilirsiniz.

## 5. İzin gerekçeleri

Chrome Web Store'un "Privacy practices" sekmesi her izin için ayrı gerekçe ister. Aşağıdaki metinler
doğrudan yapıştırılabilir.

**Tek amaç (single purpose):**
> Replaces the browser's right-click menu with a customizable menu of actions for the selected text, link, image, video or page.

| İzin | Gerekçe |
|---|---|
| `host_permissions: <all_urls>` | The extension's purpose is a right-click menu on every website, so its content script must run on all pages. The same permission lets the background read an image the user right-clicked (to copy it or read its metadata) when the page's CORS rules block it, and capture the visible tab when the user chooses "Copy Screenshot". No page data is collected or sent anywhere unless the user runs an action that explicitly does so. |
| `storage` | Saves the user's menu settings and syncs them across the user's own devices through the browser account. |
| `clipboardWrite` | Menu actions copy text, links and images to the clipboard, including on http:// pages where the async Clipboard API is not available. |
| `downloads` | "Save Image", "Save Video", "Save Link As…" and exporting settings to a file. |
| `alarms` | Checks twice a day for a new release when the extension was not installed from a store. Store installs never make this request. |

**Uzak kod (remote code):** "No, I am not using remote code." Bütün kod pakette. `eval` veya uzaktan yüklenen
betik yok; `scripts/check.mjs` bunu her CI çalışmasında denetliyor.

## 6. Veri kullanımı beyanları

Geliştirici olarak hiçbir veri toplamıyor, saklamıyor veya satmıyoruz. Analitik ya da telemetri yok.
Bazı özellikler yalnızca kullanıcı bir menü öğesini tıkladığında veriyi kullanıcının seçtiği bir servise gönderir:

| Özellik | Giden veri | Nereye |
|---|---|---|
| Metin çıkarma (OCR) | Resmin adresi veya içeriği | OCR.Space (kullanıcının kendi API anahtarıyla) |
| Yapay zeka özetle, açıkla, çevir | Seçili metin | Kullanıcının ayarladığı LLM adresi. Varsayılan adres bilgisayarın kendisi. |
| Web'de ara, çevir, görselle ara | Seçili metin veya resim adresi | Seçilen arama ya da çeviri sitesi, yeni sekmede |
| Güncelleme denetimi | Kişisel veri yok, yalnızca istek | api.github.com (sadece mağaza dışı kurulumlarda) |

**Chrome "Data usage" formu için öneri:**
- "Website content" kutusunu işaretleyin. Gerekçe: OCR ve yapay zeka özellikleri kullanıcı istediğinde sayfa içeriğini kullanıcının seçtiği servise gönderir.
- Diğer kategoriler işaretlenmez.
- Üç taahhüdün üçü de doğru: veri satılmıyor, amaç dışı kullanılmıyor, kredi değerlendirmesi için kullanılmıyor.

**Firefox `data_collection_permissions`:** derleme şu an `required: ["none"]` yazıyor. Mozilla, kullanıcının açık
isteğiyle üçüncü tarafa giden içeriği de "veri toplama" sayarsa gönderim sırasında uyarı verir. Bu durumda
`scripts/build.mjs` içindeki değeri `required: ["none"], optional: ["websiteContent"]` yerine uygun olanla
değiştirin ve OCR ile yapay zeka özelliklerini bu izne bağlayın. Karar Mozilla'nın güncel tanımına göre verilmeli.

## 7. İnceleme riskleri ve önlemler

- **Tüm sitelere erişim:** Chrome'da "Tüm sitelerdeki verilerinizi okuyup değiştirebilir" uyarısı çıkar ve
  inceleme uzar. Eklentinin amacı her sitede sağ tık menüsü olduğu için bu izin gerekli. Yukarıdaki gerekçe
  bunu açıklıyor.
- **Tarayıcı menüsünü değiştirmek:** Kullanıcı Shift + sağ tık ile her zaman tarayıcı menüsüne ulaşabilir. Yazı
  alanlarında tarayıcı menüsü korunur. Liste açıklamasında bunu belirtmek incelemeyi kolaylaştırır.
- **Firefox kaynak kodu:** Kod küçültülmüyor ve paketlenmiyor. Bu yüzden AMO ayrı kaynak kodu istemez.
- **Kurulumda ayar sayfası açılması:** Mağazalar buna izin veriyor. Firefox'ta site erişim izni burada istenir.

## 8. İlk gönderim adımları

**Chrome Web Store:** [Developer Dashboard](https://chrome.google.com/webstore/devconsole) → "New item" →
chromium ZIP → Store listing, Privacy practices ve Distribution sekmelerini doldurun → "Submit for review".

**Edge Add-ons:** [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge) → "Create new extension" →
aynı chromium ZIP → metinler ve görseller → gönder.

**Firefox AMO:** [Developer Hub](https://addons.mozilla.org/developers/) → "Submit a New Add-on" →
"On this site" → firefox ZIP → metinler → gönder.

**Opera:** [Opera add-ons developer](https://addons.opera.com/developer/) → chromium ZIP yükleyin.

## 9. Otomatik yayın (isteğe bağlı)

İlk gönderimi elle yaptıktan sonra `.github/workflows/publish-stores.yml` iş akışı bir GitHub sürümünün
paketlerini mağazalara yükleyebilir. Actions sekmesinden elle başlatılır ve yalnızca gizli anahtarları
tanımlı mağazalara gönderir. Mağazalar her sürümü yine inceler.

| Mağaza | Depo gizli anahtarları | Nereden alınır |
|---|---|---|
| Chrome | `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_EXTENSION_ID` | Google Cloud Console'da Chrome Web Store API için OAuth istemcisi; yenileme belirteci OAuth akışıyla bir kez alınır; kimlik panelde yazar |
| Firefox | `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` | AMO → "Manage API Keys" |
| Edge | `EDGE_CLIENT_ID`, `EDGE_API_KEY`, `EDGE_PRODUCT_ID` | Partner Center → Publish API |

AMO anahtarları tanımlıysa Release iş akışı kendinden barındırılan Firefox paketini de imzalar ve sürüme
`updates.json` ekler. Böylece mağaza dışından kurulan Firefox kopyaları da kendiliğinden güncellenir.

## 10. Güncellemeler kullanıcıya nasıl ulaşır

- **Mağazadan kurulanlar:** Tarayıcı yeni sürümü kendisi indirir. Eklenti güncellemeyi beklemeden uygular,
  simgede "NEW" rozeti ve ayar sayfasında "Yenilikler" bandı gösterir.
- **GitHub'dan kurulan Firefox paketi:** İmzalı paket `update_url` sayesinde tarayıcı tarafından güncellenir.
- **Paketlenmemiş (geliştirici) kurulumlar:** Chrome bunları kendisi güncelleyemez. Eklenti günde iki kez
  GitHub Releases'e bakar, yeni sürüm varsa rozet ve indirme bağlantısı gösterir.

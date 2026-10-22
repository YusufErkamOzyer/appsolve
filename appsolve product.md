# ÜRÜN GEREKSİNİM DOKÜMANI (PRD): Appsolve (Otonom AI Olay Yönetimi Platformu)

## 1. Ürün Vizyonu
**Appsolve**, bağlı olduğu dijital ürünlerden (QuickCart mobil uygulaması) gelen gerçek zamanlı hata sinyallerini karşılayan, bu hataların iş etkisini (Severity) kendi başına analiz eden, düşük riskli sorunları insan müdahalesi olmadan çözen, kritik krizlerde ise nöbetçi mühendisleri (On-Call) uyandırarak onlarla "War Room" (Savaş Odası) ortamında omuz omuza çalışan yeni nesil bir olay yönetimi ve sistem durumu (Status Page) platformudur.

## 2. Çekirdek Yapay Zeka Ajanı ve Karar Mekanizması
Appsolve'un kalbinde bir **AI SRE Ajanı** bulunur. Mobil uygulamadan ham bir hata sinyali geldiğinde ajan şu 3 adımı sırasıyla işletir:

### Adım 1: Bağlamsal Triage ve SEV (Kritiklik) Belirleme
Ajan, gelen hatada hazır bir kritiklik seviyesi aramaz; hatanın **iş etkisini (Business Impact)** değerlendirerek `SEV-1`, `SEV-2` veya `SEV-3` olduğuna kendisi karar verir ve bu kararın gerekçesini açıklar:
* **SEV-3 (Minör / Düşük Etki):** Uygulamanın ana akışı (satın alma/giriş) çalışmaktadır. Sorun kozmetiktir, yan bir özelliktedir veya sadece performans kaynaklı geçici bir şişmedir (Örn: Görsel önbellek doluluğu, öneri listesinin yavaşlaması).
* **SEV-2 (Majör / Kısmi Kayıp):** Önemli bir işlev bozulmuştur veya yeni açılan bir özellik belirli kullanıcıların ödeme/sepet adımını engellemektedir. Gelir kaybı başlamıştır ancak alternatif akışlar veya net bir geri alma (rollback) yolu mevcuttur.
* **SEV-1 (Kritik / Tam Çöküş):** Kullanıcılar uygulamaya hiç girememektedir veya ödeme sistemi tamamen durmuştur. Hata oranı çok yüksektir, veri kaybı veya tam hizmet kesintisi vardır.

### Adım 2: SEV Tabanlı Yetki Kısıtlaması (Guardrails)
Belirlenen SEV seviyesi, sistemin ve ajanın davranış kurallarını anında değiştirir:
* **Otonomi Kilidi:** `SEV-3` seviyesinde ajan sistemi düzeltmek için tam yetkiye sahiptir. `SEV-2` seviyesinde ajanın doğrudan müdahale yetkisi kilitlenir; sadece çözüm planı hazırlayabilir ve insan onayı bekler. `SEV-1` seviyesinde ise tam güvenlik modu devreye girer; ajan tek başına hiçbir sistem ayarını değiştiremez, yalnızca analiz yapar ve mühendisin talimatlarını uygular.
* **Akıllı Eskalasyon:** `SEV-3`'te kimse rahatsız edilmez. `SEV-2`'de nöbetçi mühendis çağrılır. `SEV-1`'de nöbetçi mühendis ile birlikte Takım Lideri de otomatik olarak olaya dahil edilir ve ekranda bir SLA (Çözüm Süresi) sayacı başlar.

### Adım 3: Üçlü Çözüm Yolu (Senaryo Yönlendirmesi)

#### Yol A: Tam Otonom Çözüm (İnsansız Akış)
* **Koşul:** Sorun `SEV-3` seviyesindedir ve ajan sorunun kök nedeninden ve çözümünden emindir.
* **Akış:** Ajan hipotezini oluşturur -> İlgili sistem düzeltmesini (Örn: Önbellek temizleme, kaynak artırma) kendi başına uygular -> Mobil uygulamanın düzeldiğini doğrular -> Olayı kapatır ve otomatik olarak **Post-Mortem (Olay Sonrası Analiz)** raporunu yayınlar.

#### Yol B: İnsan Onaylı Hızlı Çözüm (Tek Tıkla Plan Onayı)
* **Koşul:** Sorun `SEV-2` seviyesindedir (veya etkisi yüksek bir işlemdir). Ajan çözümü biliyordur ancak insan onayı şarttır.
* **Akış:** Ajan olayı oluşturur -> **War Room (Canlı Sohbet Odası)** anında açılır -> Nöbetçi mühendise bildirim gider -> Ajan, War Room'un içine **Hipotezini** ve hazırladığı **Çözüm Planını** içeren interaktif bir **"Eylem Kartı"** bırakır -> Mühendis odaya girer, planı inceler ve kart üzerindeki **[Onayla ve Uygula]** butonuna tek tıkla basar -> Ajan planı uygular, mobil uygulama düzelir ve Post-Mortem raporu üretilir. *(Mühendis isterse butona basmayıp chat üzerinden ajana farklı bir talimat da verebilir).*

#### Yol C: Mühendis + Ajan Ortak Çözümü (Aktif War Room İşbirliği)
* **Koşul:** Sorun `SEV-1` seviyesindedir veya ajanın tek başına çözemeyeceği kadar karmaşık/belirsizdir.
* **Akış:** Ajan olayı oluşturur -> Ekran kırmızı alarm moduna geçer, **War Room** açılır ve nöbetçi mühendis acil uyandırılır -> Ajan elindeki tüm bulguları, sistem metriklerini ve ilk hipotezini sohbet odasına yazar -> Mühendis ve ajan sohbet ekranında karşılıklı soru-cevap yaparak (Örn: Mühendis: *"Aktif kilitli işlemleri kontrol et"*, Ajan: *"Kontrol ettim, şu işlem kilitli görünüyor"*, Mühendis: *"O işlemi sonlandır ve yedek kaynağı devreye al"*) sorunu adım adım çözer -> Krizin şiddeti azaldıkça ajan olayın seviyesini canlı olarak düşürebilir (`SEV-1` -> `SEV-2` Downgrade) -> Sorun tamamen çözüldüğünde tüm sohbet ve aksiyon geçmişinden kapsamlı bir **Post-Mortem** üretilir.

## 3. Kullanıcı Arayüzü Modülleri (Web Platformu)

Appsolve web uygulaması iki ana yüzeye sahiptir:

### A. Mühendis Komuta Merkezi (Internal Dashboard)
1. **Canlı Olay Listesi ve SEV-Duyarlı Başlık:** Aktif olayların listelendiği, `SEV-1` durumunda kırmızı alarm ve SLA sayacı gösteren üst alan.
2. **AI Triage & Hipotez Paneli:** Ajanın olaya neden o SEV derecesini verdiğini (düşünce sürecini) ve kök neden tahminini gösteren özet kutusu.
3. **Her Daim Aktif War Room (Sohbet ve Eylem Alanı):** On-call tetiklendiği andan itibaren açık olan, içinde mühendis-ajan mesajlaşmalarının ve "Tek Tıkla Onay" kartlarının yer aldığı merkezi çalışma alanı.
4. **Canlı Zaman Çizelgesi (Incident Timeline):** Olayın başlangıcından çözümüne kadar gerçekleşen her kritik adımın (Hata alındı -> SEV belirlendi -> Mühendis çağrıldı -> Aksiyon alındı -> Çözüldü) saniye saniye işlendiği görsel akış.
5. **Otomatik Post-Mortem Görüntüleyici:** Olay çözüldüğü anda ajanın oluşturduğu; Özet, Kök Neden, Etki Süresi ve Alınan Aksiyonları içeren düzenli rapor ekranı.

### B. Müşteri Durum Sayfası (Public Status Page)
Son kullanıcıların (QuickCart müşterilerinin) sistemin sağlığını gördüğü herkese açık sayfadır:
* **Servis Sağlık Göstergeleri:** Giriş, Katalog, Sepet ve Ödeme servislerinin anlık durumunu (Çalışıyor / Performans Kaybı / Kesinti) renklerle gösterir.
* **AI Destekli Müşteri İletişimi:** İçeride teknik bir kriz yaşanırken, ajan bu durumu teknik terimlerden arındırarak müşteriye uygun, kurumsal bir dille otomatik olarak bu sayfada yayınlar. `SEV-3` olayları müşteriye yansıtılmazken, `SEV-2` ve `SEV-1` olaylarında şeffaf durum güncellemeleri (İnceleniyor -> Sorun Tespit Edildi -> Çözüldü) otomatik paylaşılır.

## 4. Canlı Sunum (Demo) Başarı Kriterleri
Sunum sırasında ekran ikiye (bir tarafta QuickCart mobil uygulaması ve Müşteri Status Page, diğer tarafta Appsolve Komuta Merkezi) bölündüğünde izleyici şu deneyimi kesintisiz görmelidir:
1. Mobil uygulamada gerçek bir kullanıcı akışı sırasında hata meydana gelir.
2. Appsolve hatayı yakalar, yapay zeka iş etkisini analiz ederek SEV seviyesini belirler.
3. SEV seviyesine göre ya insansız çözer, ya tek tıkla onay ister ya da mühendisle sohbet ederek krizi yönetir.
4. Çözüm uygulandığı saniye mobil uygulama kendi kendine düzelir, Status Page yeşile döner ve olayın Post-Mortem raporu ekranda belirir.
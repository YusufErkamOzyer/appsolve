# Appsolve — Otonom AI Olay Yönetimi ve Güvenilirlik Platformu (Autonomous SRE)

> **Canlı Yayında:**
> - **Web Uygulaması (Workstation):** [https://appsolve.vercel.app](https://appsolve.vercel.app)
> - **Genel Durum Sayfası (Status Page):** [https://appsolve.vercel.app/status](https://appsolve.vercel.app/status)
> - **Arka Yüz API (Render Engine):** [https://appsolve.onrender.com](https://appsolve.onrender.com)
> - **Sistem Sağlık Kontrolü:** [https://appsolve.onrender.com/up](https://appsolve.onrender.com/up)

---

## 📌 Proje Genel Bakışı

**Appsolve**, modern dijital sistemlerden gelen gerçek zamanlı hata ve telemetri sinyallerini otonom olarak karşılayan, iş etkisi (Severity) analizini yapay zeka ile gerçekleştiren, düşük riskli arızaları kendi kendine onaran ve kritik krizlerde SRE mühendisleri ile interaktif War Room ortamında çalışan yeni nesil bir **Otonom Olay Yönetimi ve Sistem Güvenilirliği (SRE)** platformudur.

Geleneksel alarm ve log yönetim araçlarının aksine Appsolve; sadece hata bildirmekle kalmaz, hatanın kök nedenini kod seviyesinde teşhis eder, çözüm için otomatik Git dalı açar, kod yamasını üretir, PR oluşturur ve onay mekanizması üzerinden canlı sistemlerin kesintisiz çalışmasını güvence altına alır.

---

## 🚀 Temel Yetenekler ve Özellikler

### 1. Akıllı Telemetri Karşılama ve Tekilleştirme (Deduplication)
- Dağıtık servislerden gelen ham istisna, stack trace ve sağlık sinyallerini toplar.
- Aktif ve mükerrer hata akışlarını anında tekilleştirerek yapay zekanın aynı olaya mükerrer efor harcamasını engeller.

### 2. Bağlamsal Triage ve SEV Değerlendirmesi
- Gelen her hatayı kural tabanlı katı şablonlar yerine **iş etkisi (Business Impact)** perspektifinden dinamik olarak sınıflandırır:
  - **SEV-3 (Minör / Düşük Etki):** Temel akışı engellemeyen yan fonksiyon arızaları.
  - **SEV-2 (Majör / Kısmi Kesinti):** Önemli işlevlerin bozulduğu, gelir veya işlem kaybı riski taşıyan olaylar.
  - **SEV-1 (Kritik / Tam Çöküş):** Sistemin ana damarlarının durduğu, acil müdahale gerektiren tam kesintiler.

### 3. Dinamik Otonomi ve Yetki Kısıtları (Guardrails)
- **SEV-3 Seviyesinde Tam Otonomi:** Düşük riskli durumlarda insan müdahalesine gerek kalmadan teşhis ve düzeltme adımları otomatik yürütülür.
- **SEV-2 / SEV-1 Kriz Kilidi:** Kritik arızalarda otonom doğrudan uygulama engellenir; AI teşhis hipotezini ve planını hazırlar, War Room üzerinden nöbetçi mühendisin (On-Call SRE) onayına sunar.

### 4. İnteraktif War Room ve `@solver` AI Copilot
- Hata anında canlı telemetri, tanılama adımları ve sequential zaman çizelgesiyle zenginleştirilmiş War Room arayüzü.
- Mühendislerin `@solver` ajanı ile gerçek zamanlı sohbet edebildiği, hipotezleri tartışabildiği ve tek tıkla yürütme aksiyonu alabildiği komuta merkezi.

### 5. Otonom Kod Onarımı ve Git / PR Entegrasyonu
- Hatanın kaynağı olan depoda yeni bir fix dalı açar.
- Kök nedeni düzelten yamayı (`UnifiedDiffViewer`) üretir ve GitHub üzerinden otomatik Pull Request oluşturur.
- Çözüm doğrulandığında ve onaylandığında PR'ı ana dala birleştirerek ortamları senkronize eder.

### 6. PostMortem 1.1 — Otomatik Kök Neden Raporu
- Olay çözüldükten sonra olay kronolojisini, kök neden analizini, kurtarma adımlarını ve tekrarlanmayı önleyici aksiyon maddelerini (Action Items) yapay zeka ile sentezleyip dokümante eder. Markdown olarak dışa aktarılabilir.

### 7. Şeffaf Kamu Durum Sayfası (`/status`)
- Son kullanıcılar ve paydaşlar için sistem durumunu, aktif kesintileri ve yapay zeka tarafından kurumsal bir dille kaleme alınan durum güncellemelerini gerçek zamanlı sunar.

---

## 🛠️ Mimari ve Teknoloji Yığını

```
┌────────────────────────────────────────────────────────┐
│            Appsolve Retro Workstation UI               │
│          Next.js 16 (App Router) + TailwindCSS         │
│          Canlı URL: https://appsolve.vercel.app        │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTP / REST / SSE
┌──────────────────────────▼─────────────────────────────┐
│             Appsolve Backend API Engine                │
│                 Ruby on Rails 8.1 API                  │
│       Canlı URL: https://appsolve.onrender.com         │
│  - Signal Ingestion & Deduplication Pipeline           │
│  - TypeSafe Decision & Gemini AI SRE Engine            │
│  - Guardrails & Severity Classification                │
│  - GitHub Octokit Git Automation & PR Lifecycle        │
│  - PostMortem Synthesis Engine                         │
└────────────────────────────────────────────────────────┘
```

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS, Lucide Icons, Geometrik Baykuş Kimliği ve Retro Workstation Teması.
- **Backend:** Ruby on Rails 8.1 API, SQLite / PostgreSQL adaptörleri, Puma uygulama sunucusu.
- **Yapay Zeka & Karar Modelleri:** TypeSafe Jev Karar Motoru & Google Gemini Modelleri.
- **Dağıtım (Production):** Vercel (Frontend & Edge CDN) + Render (Rails API Engine).

---

## 📊 Final Geliştirme Eforu ve Metrik Raporu

Bu platform, **Perşembe** günü başlatılmış olup **Cuma, Cumartesi ve Pazar** günleri boyunca yaklaşık **15 - 20 saatlik** yüksek odaklı insan-yapay zeka ortak geliştirme süreci ile baştan sona tasarlanmış, kodlanmış, test edilmiş ve canlıya alınmıştır.

Geliştirme sürecinde yapay zeka ajanının ürettiği tokenlar ve oturum metrikleri aşağıda detaylandırılmıştır:

### 📈 Özet Metrik Tablosu

| Metrik | Değer | Açıklama |
| :--- | :--- | :--- |
| **Geliştirici Odaklanma Süresi** | **15 - 20 Saat** | Perşembe (başlangıç), Cuma, Cumartesi, Pazar (canlıya çıkış) |
| **Toplam Oturum Sayısı** | **21 Oturum** | Mimari, modül uygulamaları, testler ve canlı yayına alış |
| **Ajanın Ürettiği Token (Output Tokens)** | **1,220,645** | Yalnızca ajanın ürettiği kod, plan, analiz ve yanıt tokenları |
| **Toplam İşlenen Girdi Token (Input Tokens)** | **12,297,147** | Ajan tarafından okunan bağlam ve talimat tokenları |
| **Önbellek Okuma Tokenı (Cache Read)** | **205,197,638** | Sistem optimizasyonuyla önbellekten beslenen token hacmi |
| **Toplam İşlenen Token Hacmi (In + Out)** | **13,517,792** | Tüm geliştirme döngüsündeki efektif işlem hacmi |

---

### 📅 Gün Bazında Ajanın Ürettiği Token Dağılımı

```
Perşembe (22 Ekim)   ███ 127,569 token  (~%10.5)
Cuma     (23 Ekim)   ██████████ 408,543 token  (~%33.5)
Cumartesi(24 Ekim)   ████ 183,435 token  (~%15.0)
Pazar    (25 Ekim)   ████████████ 501,098 token  (~%41.0)
──────────────────────────────────────────────────────────
TOPLAM ÜRETİLEN      1,220,645 token
```

| Gün | Tarih | Üretilen (Output) Token | Girdi (Input) Token | Başlıca Geliştirme Odağı |
| :--- | :--- | :---: | :---: | :--- |
| **1. Gün** | 22 Ekim (Perşembe) | **127,569** | 736,281 | Ürün PRD analizi, Master Plan oluşturma, UI teması & 1-2. Modüller |
| **2. Gün** | 23 Ekim (Cuma) | **408,543** | 2,420,999 | Modül 3, 4, 5 (War Room @solver), Modül 6 (PostMortem 1.1) ve Modül 7 (Status Page) |
| **3. Gün** | 24 Ekim (Cumartesi) | **183,435** | 3,473,647 | SRE Engine, Telemetri entegrasyonu, Remote Sandbox Bridge ve Git PR altyapısı |
| **4. Gün** | 25 Ekim (Pazar) | **501,098** | 5,666,220 | Chaos testleri, SEV çıkarım optimizasyonları, Render + Vercel canlı dağıtımı, hata tekilleştirme ve UI finalizasyonu |
| **TOPLAM** | **4 Günlük Sprint** | **1,220,645** | **12,297,147** | **Canlıda Çalışan Uçtan Uca SRE Platformu** |

---

### 🧩 Aşama ve Modül Bazlı Efor Dağılımı

1. **Faz 1: Çekirdek Mimari ve Temel Arayüz (Perşembe — 127K Token)**
   - Ürün gereksinimlerinin analiz edilmesi, Master Plan mimarisinin kurulması.
   - Next.js retro workstation tasarım dilinin ve temel Rails API modellerinin ayağa kaldırılması.

2. **Faz 2: Olay Yönetimi, War Room ve Raporlama (Cuma — 408K Token)**
   - SEV-1 / SEV-2 / SEV-3 karar kurallarının ve otonomi kısıtlarının (Guardrails) inşası.
   - War Room arayüzü ve interaktif `@solver` SRE yardımcısının geliştirilmesi.
   - PostMortem 1.1 otomatik AI olay sentezleme ve dışa aktarma yeteneğinin entegrasyonu.
   - Kurumsal iletişim diline sahip kamuya açık durum sayfasının (`/status`) kodlanması.

3. **Faz 3: SRE Motoru ve Git Otomasyonu (Cumartesi — 183K Token)**
   - Uzaktan SRE çalışma köprüsü, canlı telemetri soketleri ve teşhis protokollerinin yazılması.
   - Otomatik Git dal yönetimi, kod onarım motoru, diff görüntüleyici ve GitHub PR onay mekanizması.

4. **Faz 4: Chaos Testleri, Canlı Yayına Alma ve Kararlılık (Pazar — 501K Token)**
   - Hata tekilleştirme ve çift analiz önleme optimizasyonları.
   - Arka yüzün Render platformuna (`appsolve.onrender.com`), ön yüzün Vercel platformuna (`appsolve.vercel.app`) kesintisiz kurulumu.
   - Zaman çizelgesi ardışıklığı ve retro görsel kimliğin nihai cilalanması.

---

## 🏁 Sonuç

Yalnızca **15 - 20 saatlik** odaklanmış bir efor ve **1,220,645 üretilen token** hacmiyle, endüstri standardında sıfırdan otonom bir AI SRE olay yönetimi platformu başarıyla hayata geçirilmiş, test edilmiş ve şu an **canlı ortamda hizmet verir** duruma getirilmiştir.

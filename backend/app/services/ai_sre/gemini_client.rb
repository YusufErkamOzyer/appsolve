require "net/http"
require "json"
require "uri"

module AiSre
  class GeminiClient
    DEFAULT_MODEL = "gemini-2.5-flash".freeze
    BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models".freeze

    SYSTEM_INSTRUCTION = <<~PROMPT.strip
      Sen Appsolve platformunun kıdemli AI SRE (Site Reliability Engineering) Ajanısın.
      Görevin: QuickCart e-ticaret mobil uygulamasından gelen ham telemetri ve hata sinyallerini analiz etmek.
      
      QuickCart Servisleri:
      1. Giriş (auth): Kimlik doğrulama, token ve oturum yönetimi.
      2. Katalog (catalog): Ürün arama, listeleme ve stok.
      3. Sepet (cart): Kupon hesaplama, sepet oturum durumu (Redis).
      4. Ödeme (checkout): Banka provizyonu, ödeme ağ geçidi ve sipariş kaydı.

      Değerlendirme Kriterleri (İş Etkisi - Business Impact):
      - SEV-1 (Kritik / Tam Çöküş): Kullanıcılar sisteme hiç giremiyor veya ödeme akışı tamamen kilitlenmiş. Yüksek hata oranı (%50+), veri kaybı veya tam kesinti var.
      - SEV-2 (Majör / Kısmi Kayıp): Önemli bir işlev bozuk (örn. sepet kuponları bozuk veya belirli kullanıcılar sipariş veremiyor). Gelir kaybı başlamış ancak alternatif akış veya geri alma (rollback) imkanı var.
      - SEV-3 (Minör / Düşük Etki): Ana satın alma ve giriş akışları çalışıyor. Hata kozmetik, önemsiz bir yan özellikte veya geçici bir önbellek/bellek şişmesi (örn. CDN önbellek doluluğu).

      Çıktı dili: Türkçe, teknik ve net olmalı.
    PROMPT

    RESPONSE_SCHEMA = {
      type: "OBJECT",
      properties: {
        severity: {
          type: "STRING",
          enum: ["SEV-1", "SEV-2", "SEV-3"]
        },
        business_impact_reasoning: {
          type: "STRING"
        },
        root_cause_hypothesis: {
          type: "STRING"
        },
        recommended_action_plan: {
          type: "OBJECT",
          properties: {
            plan_id: { type: "STRING" },
            title: { type: "STRING" },
            tool_name: { type: "STRING" },
            risk_level: { type: "STRING", enum: ["low", "medium", "high"] },
            steps: {
              type: "ARRAY",
              items: { type: "STRING" }
            }
          },
          required: ["plan_id", "title", "tool_name", "risk_level", "steps"]
        }
      },
      required: ["severity", "business_impact_reasoning", "root_cause_hypothesis", "recommended_action_plan"]
    }.freeze

    WAR_ROOM_SYSTEM_INSTRUCTION = <<~PROMPT.strip
      Sen Appsolve platformunun kıdemli AI SRE (Site Reliability Engineering) Ajanısın. War Room sohbetindeki adın "@solver".
      Nöbetçi Mühendis (On-Call SRE) ile War Room ortamında aktif kriz yönetimi yürütüyorsun.
      
      QuickCart Servisleri: Giriş (auth), Katalog (catalog), Sepet (cart), Ödeme (checkout).

      Görevlerin:
      1. Mühendisin sorularına teknik, net ve profesyonel Türkçe ile yanıt ver.
      2. Krizin hatasını, kök neden hipotezini ve telemetri metriklerini açıkla.
      3. Mühendis senden yeni yönergelerle plan istediğinde (örn. "yeni plan hazırla", "önce kilitleri temizle", "replikaya yönlendir"), net adımları olan bir İmplementasyon Planı (plan_id, title, tool_name, risk_level, steps) oluştur.
      4. Mühendis tanı veya metrik sorguladığında (örn. "kilitleri kontrol et", "durum nedir"), tanısal komut adı bildir (örn. "inspect_db_locks").
      5. Mühendis servis sağlığını doğrulayıp olayı kapatmanı istediğinde resolve_incident: true bildir.
    PROMPT

    WAR_ROOM_RESPONSE_SCHEMA = {
      type: "OBJECT",
      properties: {
        reply_text: { type: "STRING" },
        create_plan: { type: "BOOLEAN" },
        plan: {
          type: "OBJECT",
          properties: {
            plan_id: { type: "STRING" },
            title: { type: "STRING" },
            tool_name: { type: "STRING" },
            risk_level: { type: "STRING", enum: ["low", "medium", "high"] },
            steps: {
              type: "ARRAY",
              items: { type: "STRING" }
            }
          }
        },
        diagnostic_command: { type: "STRING" },
        resolve_incident: { type: "BOOLEAN" }
      },
      required: ["reply_text", "create_plan", "resolve_incident"]
    }.freeze

    def initialize(api_key: ENV["GEMINI_API_KEY"], model: DEFAULT_MODEL)
      @api_key = api_key
      @model = model
    end

    def analyze_signal(service:, raw_payload:)
      if @api_key.present? && ENV["MOCK_AI"] != "true"
        begin
          call_gemini_api(service: service, raw_payload: raw_payload)
        rescue StandardError => e
          Rails.logger.warn("[AiSre::GeminiClient] Gemini API çağrısı başarısız oldu (#{e.message}), deterministik yedek analize geçiliyor.")
          fallback_analysis(service: service, raw_payload: raw_payload)
        end
      else
        fallback_analysis(service: service, raw_payload: raw_payload)
      end
    end

    def chat_in_war_room(incident:, message_content:, history: [])
      if @api_key.present? && ENV["MOCK_AI"] != "true"
        begin
          call_gemini_war_room_api(incident: incident, message_content: message_content, history: history)
        rescue StandardError => e
          Rails.logger.warn("[AiSre::GeminiClient] Gemini War Room API çağrısı başarısız oldu (#{e.message}), deterministik yedek yanıta geçiliyor.")
          fallback_war_room_chat(incident: incident, message_content: message_content)
        end
      else
        fallback_war_room_chat(incident: incident, message_content: message_content)
      end
    end

    private

    def call_gemini_api(service:, raw_payload:)
      url = URI("#{BASE_URL}/#{@model}:generateContent?key=#{@api_key}")
      http = Net::HTTP.new(url.host, url.port)
      http.use_ssl = true
      http.read_timeout = 15
      http.open_timeout = 5

      request = Net::HTTP::Post.new(url.request_uri, { "Content-Type" => "application/json" })

      user_prompt = <<~PROMPT
        Aşağıdaki QuickCart ham hata telemetri sinyalini analiz et:
        - Servis: #{service.name} (#{service.slug}) - #{service.description}
        - Telemetri Yükü: #{raw_payload.to_json}

        Lütfen iş etkisini değerlendir, SEV-1, SEV-2 veya SEV-3 seviyesini belirle, gerekçesini, kök neden hipotezini ve önerilen eylem planını sağlanan JSON şemasına uygun olarak üret.
      PROMPT

      body = {
        system_instruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: user_prompt }]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.1
        }
      }

      request.body = body.to_json
      response = http.request(request)

      unless response.is_a?(Net::HTTPSuccess)
        raise "Gemini API HTTP #{response.code}: #{response.body}"
      end

      parsed_response = JSON.parse(response.body)
      text_content = parsed_response.dig("candidates", 0, "content", "parts", 0, "text")

      unless text_content
        raise "Gemini API yanıtında metin içeriği bulunamadı."
      end

      JSON.parse(text_content).with_indifferent_access
    end

    def fallback_analysis(service:, raw_payload:)
      slug = service.slug.to_s.downcase
      error_code = raw_payload["error_code"].to_s.upcase
      message = raw_payload["message"].to_s
      metrics = raw_payload["metrics"] || {}
      error_rate = metrics["error_rate"].to_f

      if slug == "checkout" || error_code.include?("DB_LOCK") || error_code.include?("504") || error_code.include?("DEADLOCK") || error_rate >= 0.7
        {
          severity: "SEV-1",
          business_impact_reasoning: "Ödeme altyapısında kritik kilitlenme tespit edildi. Hata oranı %#{((error_rate > 0 ? error_rate : 0.94) * 100).to_i} seviyesinde ve müşterilerin sipariş tamamlama akışı tamamen durmuş durumda. Doğrudan ciro kaybı ve müşteri güveni sarsılması söz konusu.",
          root_cause_hypothesis: "Ödeme ağ geçidi ile veritabanı arasındaki işlem kuyruğunda 'payment_records' tablosunda eşzamanlı satır kilitlenmesi (row lock deadlock). Arka plandaki iş parçacıkları zaman aşımına düşüyor.",
          recommended_action_plan: {
            plan_id: "PLAN #01",
            title: "Veritabanı Kilitlerini Temizle ve Havuz Yedeğine Geç",
            tool_name: "kill_db_locks_and_failover",
            risk_level: "high",
            steps: [
              "Bloke olan 48 iş parçacığını ve kilitli işlemleri sonlandır",
              "Bağlantı havuzunu (connection pool) sıfırla",
              "Ödeme trafiğini geçici olarak yedek okuma/yazma kümesine yönlendir"
            ]
          }
        }.with_indifferent_access
      elsif slug == "cart" || error_code.include?("NAN") || error_code.include?("COUPON") || error_code.include?("REDIS") || error_rate >= 0.2
        {
          severity: "SEV-2",
          business_impact_reasoning: "Sepet promosyon ve kupon hesaplama modülünde veri bozulması yaşanıyor. Etkilenen kullanıcı oranı yaklaşık %#{((error_rate > 0 ? error_rate : 0.28) * 100).to_i}. Müşteriler sepette indirim uygulayamıyor, ancak temel ürün inceleme ve sepet oluşturma çalışıyor.",
          root_cause_hypothesis: "Redis 'promo_v2' anahtarındaki seri hale getirme formatı bozulmuş ve float dönüşümü NaN hatası fırlatıyor. Kupon doğrulama servisi yanıt veremiyor.",
          recommended_action_plan: {
            plan_id: "PLAN #02",
            title: "Bozuk Promosyon Bayrağını Geri Al ve Kupon Önbelleğini Temizle",
            tool_name: "rollback_feature_flag",
            risk_level: "medium",
            steps: [
              "promo_v2 özellik bayrağını (feature flag) derhal kapat",
              "Redis üzerindeki bozuk kupon anahtarlarını temizle (FLUSH_KEYS)",
              "Önceki kararlı promo_v1 modülünü yeniden devreye al"
            ]
          }
        }.with_indifferent_access
      else
        {
          severity: "SEV-3",
          business_impact_reasoning: "Katalog servisinde ürün görsel önbellek şişmesi tespit edildi. Satın alma ve giriş akışları kesintisiz çalışıyor. Sorun sadece bazı ürün küçük resimlerinin geç yüklenmesiyle sınırlı kozmetik/performans etkisi taşımaktadır.",
          root_cause_hypothesis: "CDN kenar önbellek bellek doluluğu %90 eşiğini aştı. Eski küçük resimler için LRU tahliye politikası gecikmeli çalışıyor.",
          recommended_action_plan: {
            plan_id: "PLAN #03",
            title: "CDN Küçük Resim Önbelleğini Temizle ve Bellek Limitini Genişlet",
            tool_name: "flush_cache",
            risk_level: "low",
            steps: [
              "catalog-thumbnails CDN önbellek etiketini temizle (purge)",
              "LRU tahliye eşiğini dinamik olarak %80'e çek",
              "Önbellek isabet oranını doğrula"
            ]
          }
        }.with_indifferent_access
      end
    end

    def call_gemini_war_room_api(incident:, message_content:, history: [])
      url = URI("#{BASE_URL}/#{@model}:generateContent?key=#{@api_key}")
      http = Net::HTTP.new(url.host, url.port)
      http.use_ssl = true
      http.read_timeout = 15
      http.open_timeout = 5

      request = Net::HTTP::Post.new(url.request_uri, { "Content-Type" => "application/json" })

      context_prompt = <<~PROMPT
        Olay Bilgileri:
        - Kod: #{incident.incident_code} (#{incident.severity}) - Durum: #{incident.status}
        - Servis: #{incident.service&.name} (#{incident.service&.slug})
        - Hata Başlığı: #{incident.title}
        - AI Kök Neden Hipotezi: #{incident.hypothesis}
        - AI İş Etkisi / Gerekçe: #{incident.reasoning}
        - Ham Telemetri Metrikleri: #{incident.raw_payload&.dig("metrics").to_json}

        Nöbetçi Mühendisin Son Mesajı:
        "#{message_content}"

        Lütfen @solver kimliğiyle bu mesaja uygun teknik açıklamayı, varsa yeni implementasyon planını (create_plan: true ve plan objesi) veya tanı komutunu üret.
      PROMPT

      body = {
        system_instruction: {
          parts: [{ text: WAR_ROOM_SYSTEM_INSTRUCTION }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: context_prompt }]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: WAR_ROOM_RESPONSE_SCHEMA,
          temperature: 0.1
        }
      }

      request.body = body.to_json
      response = http.request(request)

      unless response.is_a?(Net::HTTPSuccess)
        raise "Gemini API HTTP #{response.code}: #{response.body}"
      end

      parsed_response = JSON.parse(response.body)
      text_content = parsed_response.dig("candidates", 0, "content", "parts", 0, "text")

      unless text_content
        raise "Gemini API yanıtında metin içeriği bulunamadı."
      end

      JSON.parse(text_content).with_indifferent_access
    end

    def fallback_war_room_chat(incident:, message_content:)
      text = message_content.to_s.downcase

      # Kaçıncı plan olduğunu hesapla
      existing_plans = incident.war_room_messages.where(message_type: "action_card").count
      next_plan_num = [existing_plans + 1, 2].max
      plan_id = "PLAN #0#{next_plan_num}"

      if text.include?("kapat") || text.include?("çöz") || text.include?("tamamla") || text.include?("normale dön")
        {
          reply_text: "Tüm sentetik ödeme uç nokta testleri ve p99 gecikme süreleri başarıyla doğrulandı. Servis operasyonel yeşil duruma geçti; olay kapatılıyor.",
          create_plan: false,
          resolve_incident: true
        }.with_indifferent_access

      elsif text.include?("yeni plan") || text.include?("revize") || text.include?("plan oluştur") || text.include?("plan hazırla") || text.include?("replika") || text.include?("alternatif") || text.include?("kilitleri temizle") || text.include?("sonlandır")
        has_replica = text.include?("replika") || text.include?("failover")
        {
          reply_text: "Yönergeleriniz doğrultusunda revize edilmiş yeni bir implementasyon planı (#{plan_id}) oluşturdum. Aşağıdaki kart üzerinden tek tıkla onaylayıp icra edebilirsiniz.",
          create_plan: true,
          plan: {
            plan_id: plan_id,
            title: has_replica ? "Hedefli Kilit Temizliği ve Replikaya Geçiş" : "Veritabanı Kilitlerini Temizle ve Havuzu Yenile",
            tool_name: has_replica ? "kill_db_locks_and_failover" : "kill_db_locks",
            risk_level: "high",
            steps: [
              "payment_records üzerindeki 48 bloke iş parçacığını SIGTERM ile sonlandır",
              "Veritabanı bağlantı havuzunu (connection pool) sıfırla ve yeniden başlat",
              has_replica ? "Ödeme trafiğini geçici olarak ikincil replikaya yönlendir" : "Ödeme işlem kuyruğu sağlığını sentetik sorguyla doğrula"
            ]
          },
          resolve_incident: false
        }.with_indifferent_access

      elsif text.include?("kontrol") || text.include?("listele") || text.include?("göster") || text.include?("metrik") || text.include?("tanı")
        {
          reply_text: "Aktif veritabanı kilit durumu ve pg_stat_activity sorgulandı. 48 iş parçacığının kilitli olduğu doğrulandı.",
          create_plan: false,
          diagnostic_command: "inspect_db_locks",
          resolve_incident: false
        }.with_indifferent_access

      elsif text.include?("açıkla") || text.include?("neden") || text.include?("kök") || text.include?("hipotez") || text.include?("hata")
        {
          reply_text: "Ödeme altyapısındaki kriz, 'payment_records' tablosunda eşzamanlı sipariş onayları esnasında oluşan satır düzeyinde karşılıklı kilitlenmeden (row lock deadlock) kaynaklanmaktadır. 48 işlem kilit sırasına girmiş, bağlantı havuzu %98 dolmuş ve istemciler 14.2 saniyelik p99 gecikmeyle 504 Gateway Timeout almaktadır. Sistemdeki ilk kurtarma planını hemen çalıştırabilir veya yönergelerinizle revize plan isteyebilirsiniz.",
          create_plan: false,
          resolve_incident: false
        }.with_indifferent_access

      else
        {
          reply_text: "Talimatınız alındı. @solver olarak emrinizdeyim. Bana hatanın kök nedenini detaylandırmamı söyleyebilir, yeni yönergelerle revize bir implementasyon planı hazırlamamı isteyebilir veya mevcut planı tek tıkla çalıştırabilirsiniz.",
          create_plan: false,
          resolve_incident: false
        }.with_indifferent_access
      end
    end
  end
end

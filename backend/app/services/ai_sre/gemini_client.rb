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
  end
end

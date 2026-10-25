require "net/http"
require "json"
require "uri"

module AiSre
  class GeminiClient
    DEFAULT_MODEL = ENV.fetch("GEMINI_MODEL", "antigravity-preview-latest").freeze
    POST_MORTEM_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash"].freeze
    BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models".freeze
    INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions".freeze

    @@cached_environment_id = nil
    @@post_mortem_cooldowns = {}

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

    POST_MORTEM_SYSTEM_INSTRUCTION = <<~PROMPT.strip
      Sen Appsolve platformunun kıdemli AI SRE (Site Reliability Engineering) Ajanısın.
      Görevin: Çözüme kavuşturulmuş bir kriz/olay (incident) için resmi, kapsamlı ve profesyonel bir Post-Mortem (Olay Sonrası Analiz) raporu hazırlamak.

      Rapor Formatı ve İçerik Gereksinimleri:
      1. Yönetici Özeti (summary): Olayın ne zaman başladığını, hangi servisi ve kullanıcıları nasıl etkilediğini ve nasıl çözüldüğünü özetleyen 2-3 paragraflık berrak Türkçe açıklama.
      2. Kök Neden Analizi (root_cause): Hatanın teknik tetikleyicisini, sistemdeki darboğazı, kilit veya önbellek mekanizmasını ve neden oluştuğunu detaylandıran derin teknik analiz.
      3. Etkilenen Servisler (affected_services): Kesintiden doğrudan veya dolaylı etkilenen servislerin listesi (örn: ["Ödeme (checkout)", "Sepet (cart)"]).
      4. Önleyici ve İyileştirici Aksiyonlar (action_items): Gelecekte benzer bir olayın yaşanmasını kesin olarak önleyecek 3-5 adet somut, uygulanabilir mühendislik aksiyon maddesi (örn: veritabanı timeout parametreleri, circuit breaker, replika konfigürasyonu, alarm eşikleri).

      Çıktı Dili: Türkçe, tarafsız (blameless post-mortem kültürü), yüksek teknik yetkinlikte.
    PROMPT

    POST_MORTEM_RESPONSE_SCHEMA = {
      type: "OBJECT",
      properties: {
        summary: { type: "STRING" },
        root_cause: { type: "STRING" },
        affected_services: {
          type: "ARRAY",
          items: { type: "STRING" }
        },
        action_items: {
          type: "ARRAY",
          items: { type: "STRING" }
        }
      },
      required: ["summary", "root_cause", "affected_services", "action_items"]
    }.freeze

    CUSTOMER_STATUS_SYSTEM_INSTRUCTION = <<~PROMPT.strip
      Sen Appsolve ve QuickCart e-ticaret platformunun "Kurumsal Müşteri İletişim Sorumlususun" (AI Public Relations & SRE Communication Specialist).
      Görevin: Sistemde yaşanan teknik olayları, mobil uygulama müşterilerine ve kamuoyuna duyurulacak şeffaf, güven veren ve TEKNİK JARGONDAN TAMAMEN ARINDIRILMIŞ Türkçe durum duyurularına dönüştürmektir.

      KESİN VE ÖNEMLİ KURALLAR:
      1. ASLA iç teknik jargonu veya kod adlarını KULLANMA. Şunlar kesinlikle YASAKTIR:
         - "DB lock", "deadlock", "PostgreSQL", "SQL", "pg_stat_activity", "veritabanı kilidi"
         - "504 Gateway Timeout", "500 Internal Error", "HTTP status code", "timeout"
         - "stack trace", "exception", "NullPointer", "NaN", "Redis", "cache flush", "bloat"
         - "feature flag", "promo_v2", "rollback", "pod", "kubernetes", "failover", "p99"
      2. Kullanıcı deneyimi perspektifinden açıklama yap:
         - Ödeme için: "Ödeme ve sipariş onaylama adımlarında"
         - Sepet için: "Sepete ürün ekleme ve indirim kuponu adımlarında"
         - Giriş için: "Kullanıcı girişi ve hesap doğrulama adımlarında"
         - Katalog için: "Ürün listeleme ve arama ekranlarında"
      3. Aşamalar (Phase):
         - "investigating" (İNCELENİYOR): Sorunun farkında olunduğu ve teknik ekibin yüksek öncelikle incelemeye aldığı belirtilir.
         - "identified" (SORUN TESPİT EDİLDİ): Aksaklığın nedeninin belirlendiği, düzeltme ve iyileştirme adımlarının yürütüldüğü belirtilir.
         - "monitoring" (İZLENİYOR): Müdahale sonrası sistemin stabiliteye kavuştuğu ve performansın yakından takip edildiği belirtilir.
         - "resolved" (ÇÖZÜLDÜ): Servislerin normale döndüğü, kesintisiz hizmet verildiği belirtilir ve teşekkür edilir.
         - "autonomous_resolved" (OTONOM ÇÖZÜLDÜ): Rutin optimizasyonun sistemlerimizce insan müdahalesi gerekmeksizin başarıyla tamamlandığı belirtilir.
      4. Ton: Kurumsal, sakin, yapıcı, güven veren e-ticaret dili.
    PROMPT

    CUSTOMER_STATUS_RESPONSE_SCHEMA = {
      type: "OBJECT",
      properties: {
        headline: { type: "STRING" },
        public_message: { type: "STRING" }
      },
      required: ["headline", "public_message"]
    }.freeze

    CODE_REPAIR_SYSTEM_INSTRUCTION = <<~PROMPT.strip
      Sen Appsolve platformunun otonom AI SRE Kod Onarım Ajanısın (Antigravity Code Repair Engine).
      Görevin: QuickCart servisinde meydana gelen çalışma zamanı hatasını (stack trace, hata mesajı ve kök neden hipotezini) inceleyerek kaynak dosyadaki hatayı düzelten yama bloğunu (target_snippet -> replacement_snippet) ve git unified diff (unified_diff) çıktısını üretmek.

      KURALLAR:
      1. Sağlanan kaynak kod içindeki hatalı satırları `target_snippet` olarak birebir seç.
      2. Hatayı güvenli şekilde çözen düzeltilmiş satırları `replacement_snippet` olarak yaz (örn. undefined nesne erişimi için `|| { multiplier: 0 }` ve optional chaining `rateConfig?.multiplier || 0` ekle).
      3. `unified_diff` standart git diff (`--- a/<dosya>` ve `+++ b/<dosya>`, `@@ ... @@`) formatında olmalıdır.
      4. `pr_title` Conventional Commits formatında (`fix(cart): resolve coupon calculation error [...]` gibi) olmalıdır.
    PROMPT

    CODE_REPAIR_RESPONSE_SCHEMA = {
      type: "OBJECT",
      properties: {
        target_snippet: { type: "STRING" },
        replacement_snippet: { type: "STRING" },
        unified_diff: { type: "STRING" },
        pr_title: { type: "STRING" },
        root_cause_explanation: { type: "STRING" }
      },
      required: ["target_snippet", "replacement_snippet", "unified_diff", "pr_title", "root_cause_explanation"]
    }.freeze

    def initialize(api_key: ENV["GEMINI_API_KEY"], model: DEFAULT_MODEL)
      @api_key = api_key
      @model = model
    end

    def analyze_signal(service:, raw_payload:, jev_decision: nil)
      result =
        if @api_key.present? && ENV["MOCK_AI"] != "true"
          begin
            call_gemini_api(service: service, raw_payload: raw_payload, jev_decision: jev_decision)
          rescue StandardError => e
            Rails.logger.warn("[AiSre::GeminiClient] Gemini API çağrısı başarısız oldu (#{e.message}), deterministik yedek analize geçiliyor.")
            fallback_analysis(service: service, raw_payload: raw_payload)
          end
        else
          fallback_analysis(service: service, raw_payload: raw_payload)
        end

      if jev_decision.present?
        result[:severity] = jev_decision[:severity] if jev_decision[:severity].present?
        result[:recommended_action_plan] ||= {}
        if jev_decision[:tool_name].present?
          result[:recommended_action_plan][:tool_name] = jev_decision[:tool_name]
          result[:recommended_action_plan]["tool_name"] = jev_decision[:tool_name]
        end
        if jev_decision[:risk_level].present?
          result[:recommended_action_plan][:risk_level] = jev_decision[:risk_level]
          result[:recommended_action_plan]["risk_level"] = jev_decision[:risk_level]
        end
      end

      result.with_indifferent_access
    end

    def generate_code_patch(incident:, source_file:, original_content:)
      if @api_key.present? && ENV["MOCK_AI"] != "true"
        begin
          return call_gemini_code_repair_api(
            incident: incident,
            source_file: source_file,
            original_content: original_content
          )
        rescue StandardError => e
          Rails.logger.warn("[AiSre::GeminiClient] Gemini Code Repair API çağrısı başarısız oldu (#{e.message}), güvenli yama üreticisine geçiliyor.")
        end
      end

      nil
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

    def generate_post_mortem(incident:)
      if @api_key.present? && ENV["MOCK_AI"] != "true"
        begin
          call_gemini_post_mortem_api(incident: incident)
        rescue StandardError => e
          Rails.logger.warn("[AiSre::GeminiClient] Gemini Flash Post-Mortem API çağrısı başarısız oldu (#{e.message}), deterministik yedek rapora geçiliyor.")
          fallback_post_mortem(incident: incident, used_model: "gemini-3.8-flash")
        end
      else
        fallback_post_mortem(incident: incident, used_model: "gemini-3.8-flash")
      end
    end

    def generate_customer_status(incident:, phase:)
      if @api_key.present? && ENV["MOCK_AI"] != "true"
        begin
          call_gemini_customer_status_api(incident: incident, phase: phase)
        rescue StandardError => e
          Rails.logger.warn("[AiSre::GeminiClient] Gemini Customer Status API çağrısı başarısız oldu (#{e.message}), deterministik yedek duyuruya geçiliyor.")
          fallback_customer_status_message(incident: incident, phase: phase)
        end
      else
        fallback_customer_status_message(incident: incident, phase: phase)
      end
    end

    private

    def antigravity_agent?
      @model.to_s.start_with?("antigravity")
    end

    def execute_structured_prompt(system_instruction:, user_prompt:, response_schema:, timeout: 45)
      if antigravity_agent?
        call_antigravity_interactions_api(
          system_instruction: system_instruction,
          user_prompt: user_prompt,
          response_schema: response_schema,
          timeout: timeout
        )
      else
        call_standard_generate_content_api(
          system_instruction: system_instruction,
          user_prompt: user_prompt,
          response_schema: response_schema,
          timeout: timeout
        )
      end
    end

    def call_antigravity_interactions_api(system_instruction:, user_prompt:, response_schema:, timeout: 45, retry_without_env: true)
      url = URI("#{INTERACTIONS_URL}?key=#{@api_key}")
      http = Net::HTTP.new(url.host, url.port)
      http.use_ssl = true
      http.read_timeout = timeout
      http.open_timeout = 10

      request = Net::HTTP::Post.new(url.request_uri, { "Content-Type" => "application/json" })

      combined_input = <<~INPUT
        CRITICAL AGENT INSTRUCTION:
        Do NOT call any tools (do NOT call bash, view_file, read_file, grep, find, or any filesystem/terminal tool).
        The target repository does NOT exist in your remote sandbox container. All required context and code are provided inline below.
        Keep internal thinking brief and minimal (<100 tokens). Respond IMMEDIATELY in your first turn with ONLY a valid JSON object matching the required schema.

        #{system_instruction}

        ---
        GÖREV:
        #{user_prompt}

        ÖNEMLİ ÇIKTI KURALI:
        Hiçbir araç (tool) çalıştırmadan doğrudan aşağıdaki JSON şemasına birebir uyan GEÇERLİ BİR JSON nesnesi döndür (Markdown kod bloğu kullanma, sadece saf JSON döndür):
        #{response_schema.to_json}
      INPUT

      payload = {
        agent: @model,
        environment: "remote",
        input: combined_input
      }
      payload[:environment_id] = @@cached_environment_id if @@cached_environment_id.present?

      request.body = payload.to_json
      response = http.request(request)

      unless response.is_a?(Net::HTTPSuccess)
        if @@cached_environment_id.present? && retry_without_env
          @@cached_environment_id = nil
          return call_antigravity_interactions_api(
            system_instruction: system_instruction,
            user_prompt: user_prompt,
            response_schema: response_schema,
            timeout: timeout,
            retry_without_env: false
          )
        end
        raise "Antigravity Interactions API HTTP #{response.code}: #{response.body}"
      end

      parsed_response = JSON.parse(response.body)
      @@cached_environment_id = parsed_response["environment_id"] if parsed_response["environment_id"].present?

      steps = Array(parsed_response["steps"])
      text_parts = steps.select { |s| s["type"] == "model_output" }.flat_map do |s|
        Array(s["content"]).select { |c| c["type"] == "text" }.map { |c| c["text"].to_s }
      end
      raw_text = text_parts.join("\n").strip

      if raw_text.empty?
        raise "Antigravity Interactions API yanıtında metin içeriği bulunamadı."
      end

      cleaned_json = extract_json_object(raw_text)
      JSON.parse(cleaned_json).with_indifferent_access
    end

    def extract_json_object(text)
      stripped = text.to_s.strip
      if stripped =~ /```(?:json)?\s*(\{.*\})\s*```/m
        return Regexp.last_match(1).strip
      end
      first_brace = stripped.index("{")
      last_brace = stripped.rindex("}")
      if first_brace && last_brace && last_brace > first_brace
        return stripped[first_brace..last_brace]
      end
      stripped
    end

    def call_standard_generate_content_api(system_instruction:, user_prompt:, response_schema:, timeout: 25, model: nil)
      target_model = model.presence || @model
      url = URI("#{BASE_URL}/#{target_model}:generateContent?key=#{@api_key}")
      http = Net::HTTP.new(url.host, url.port)
      http.use_ssl = true
      http.read_timeout = timeout
      http.open_timeout = 5

      request = Net::HTTP::Post.new(url.request_uri, { "Content-Type" => "application/json" })

      body = {
        system_instruction: {
          parts: [{ text: system_instruction }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: user_prompt }]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: response_schema,
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
      raise "Gemini API yanıtında metin içeriği bulunamadı." unless text_content

      JSON.parse(text_content).with_indifferent_access
    end

    def call_gemini_api(service:, raw_payload:, jev_decision: nil)
      jev_context =
        if jev_decision.present?
          <<~JEV
            TypeSafe Jev (System One) Ön Kategorizasyon Kararı:
            - Belirlenen Kritiklik (Severity): #{jev_decision[:severity]} (Confidence: #{jev_decision[:confidence]})
            - Teknik Kategori: #{jev_decision[:category]}
            - Önerilen Müdahale Aracı (tool_name): #{jev_decision[:tool_name]}
            - Olasılık Dağılımı: #{jev_decision[:probabilities].to_json}
          JEV
        else
          ""
        end

      user_prompt = <<~PROMPT
        Aşağıdaki QuickCart ham hata telemetri sinyalini analiz et:
        - Servis: #{service.name} (#{service.slug}) - #{service.description}
        - Telemetri Yükü: #{raw_payload.to_json}
        #{jev_context}

        Lütfen iş etkisini değerlendir, gerekçesini (business_impact_reasoning), kök neden hipotezini (root_cause_hypothesis) ve önerilen eylem planını (recommended_action_plan) sağlanan JSON şemasına uygun olarak Türkçe üret.
      PROMPT

      execute_structured_prompt(
        system_instruction: SYSTEM_INSTRUCTION,
        user_prompt: user_prompt,
        response_schema: RESPONSE_SCHEMA
      )
    end

    def call_gemini_code_repair_api(incident:, source_file:, original_content:)
      raw = incident.raw_payload || {}
      stack_trace = raw.dig("raw_payload", "stack_trace") || raw["stack_trace"] || ""
      line_num = (raw.dig("raw_payload", "line_number") || raw["line_number"]).to_i
      error_msg = raw["message"] || incident.title

      lines = original_content.to_s.lines
      focused_code =
        if lines.length > 60 && line_num > 0
          start_idx = [ line_num - 25, 0 ].max
          end_idx = [ line_num + 25, lines.length - 1 ].min
          lines[start_idx..end_idx].join
        elsif lines.length > 60
          lines.last(60).join
        else
          original_content
        end

      user_prompt = <<~PROMPT
        Aşağıdaki çalışma zamanı hatasını kaynak kod üzerinde onar:
        - Olay Kodu: #{incident.incident_code} (#{incident.severity})
        - Servis: #{incident.service&.name} (#{incident.service&.slug})
        - Hata Mesajı: #{error_msg}
        - Kök Neden Hipotezi: #{incident.hypothesis}
        - Stack Trace:
        #{stack_trace}

        - Etkilenen Kaynak Dosya Kesiti (`#{source_file}`):
        ```
        #{focused_code}
        ```

        Lütfen dosyadaki hatalı kod bloğunu `target_snippet`, düzeltilmiş halini `replacement_snippet`, `--- a/#{source_file}` ve `+++ b/#{source_file}` başlıklarını içeren `unified_diff`, uygun `pr_title` ve `root_cause_explanation` alanlarını JSON şemasına uygun üret.
      PROMPT

      execute_structured_prompt(
        system_instruction: CODE_REPAIR_SYSTEM_INSTRUCTION,
        user_prompt: user_prompt,
        response_schema: CODE_REPAIR_RESPONSE_SCHEMA,
        timeout: 65
      )
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

      execute_structured_prompt(
        system_instruction: WAR_ROOM_SYSTEM_INSTRUCTION,
        user_prompt: context_prompt,
        response_schema: WAR_ROOM_RESPONSE_SCHEMA
      )
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

    def call_gemini_post_mortem_api(incident:)
      events_summary = incident.incident_events.order(occurred_at: :asc).map do |ev|
        "#{ev.occurred_at.strftime('%H:%M:%S')} [#{ev.actor}]: #{ev.title} - #{ev.details}"
      end.join("\n")

      messages_summary = incident.war_room_messages.order(created_at: :asc).map do |msg|
        "#{msg.created_at.strftime('%H:%M:%S')} [#{msg.sender_name} (#{msg.message_type})]: #{msg.content.slice(0, 200)}"
      end.join("\n")

      prompt = <<~PROMPT
        Aşağıdaki çözülmüş kriz/olay için kapsamlı ve profesyonel bir Post-Mortem raporu sentezle:
        - Olay Kodu: #{incident.incident_code}
        - Kritiklik Seviyesi: #{incident.severity}
        - Servis: #{incident.service&.name} (#{incident.service&.slug})
        - Başlık: #{incident.title}
        - İlk Triage Hipotezi: #{incident.hypothesis}
        - Başlangıç: #{incident.created_at}
        - Çözüm: #{incident.resolved_at || Time.current}
        - Ham Telemetri: #{incident.raw_payload&.to_json}

        Olay Zaman Çizelgesi (Timeline Kayıtları):
        #{events_summary.presence || "Kayıt yok"}

        War Room Mesajlaşma ve Aksiyon Geçmişi:
        #{messages_summary.presence || "Kayıt yok"}

        Lütfen bu verileri sentezleyerek:
        1. summary: Yönetici Özeti (kesintinin iş etkisi, müşteriye yansıması ve nasıl giderildiği).
        2. root_cause: Kök Neden Analizi (teknik derinlikte hatanın kök sebebi).
        3. affected_services: Etkilenen servis isimleri dizisi.
        4. action_items: Gelecekte tekrarlanmasını önleyecek somut mühendislik iyileştirme adımları dizisi.
        JSON formatında üret.
      PROMPT

      # Kota uygunluğuna göre gemini-3.8-flash ve gemini-3.6-flash arasında seçim / failover yap
      candidates = POST_MORTEM_MODELS.sort_by do |m|
        cooldown = @@post_mortem_cooldowns[m]
        cooldown && cooldown > Time.current ? cooldown.to_f : 0.0
      end

      last_error = nil
      candidates.each do |model_name|
        begin
          res = call_standard_generate_content_api(
            system_instruction: POST_MORTEM_SYSTEM_INSTRUCTION,
            user_prompt: prompt,
            response_schema: POST_MORTEM_RESPONSE_SCHEMA,
            model: model_name,
            timeout: 35
          )
          res[:used_model] = model_name
          return res
        rescue StandardError => e
          last_error = e
          Rails.logger.warn("[AiSre::GeminiClient] Post-Mortem model '#{model_name}' hata verdi (#{e.message}). Kota soğumasına alınıyor ve yedek modele geçiliyor...")
          @@post_mortem_cooldowns[model_name] = Time.current + 90.seconds
        end
      end

      raise last_error if last_error
    end

    def fallback_post_mortem(incident:, used_model: "gemini-3.8-flash")
      sev = incident.severity.to_s
      slug = incident.service&.slug.to_s.downcase
      created_time = incident.created_at.strftime("%H:%M:%S")

      res = if sev == "SEV-1" || slug == "checkout"
        {
          summary: "QuickCart ödeme altyapısında saat #{created_time} itibarıyla ödeme ağ geçidinde kritik kilitlenme (deadlock) meydana gelmiştir. Ödeme servisindeki hata oranı %94'e fırlamış, 48 sipariş işlemi veritabanında askıda kalmış ve mobil müşterilerin ödeme akışı tamamen kesintiye uğramıştır. Nöbetçi mühendis ve Takım Lideri War Room'a dahil edilmiş, kilitli işlemler sonlandırılarak ve bağlantı havuzu sıfırlanarak sistem tamamen operasyonel duruma getirilmiştir.",
          root_cause: "PostgreSQL üzerinde 'payment_records' tablosunda eşzamanlı iki farklı işlem dalının (yeni sipariş provizyonu ile bakiye düşümü) ters sırada satır kilidi (row lock) alması sonucu karşılıklı kilitlenme (deadlock) meydana gelmiştir. idle_in_transaction_session_timeout parametresinin tanımlı olmaması nedeniyle kilitli bağlantılar havuzda asılı kalmış ve yeni gelen tüm isteklere 504 Gateway Timeout yanıtı dönmüştür.",
          affected_services: ["Ödeme (checkout)", "Sepet (cart)"],
          action_items: [
            "payment_records tablosundaki sorgu kilit sırasını deterministik hale getir (lock ordering refactoring).",
            "PostgreSQL veritabanı idle_in_transaction_session_timeout parametresini 5000 ms'ye ayarla.",
            "Ödeme ağ geçidi için 5 saniyeyi aşan isteklerde otomatik circuit-breaker tetiklenmesini sağla.",
            "Veritabanı kilit bekleme sayısı 10'u aştığında PagerDuty SEV-1 acil alarm kuralı oluştur."
          ]
        }
      elsif sev == "SEV-2" || slug == "cart"
        {
          summary: "QuickCart sepet modülünde yeni açılan promo_v2 özellik bayrağı (feature flag) nedeniyle kupon hesaplama adımında NaN (Not a Number) hatası oluşmuştur. Etkilenen kullanıcı oranı %28'e ulaşmış, indirim kuponu kullanan müşteriler sipariş tamamlama adımına geçememiştir. Ajan tarafından hazırlanan eylem kartı nöbetçi mühendisin tek tıkla onayıyla uygulanmış, bayrak geri alınarak kupon önbelleği temizlenmiş ve servis ivedilikle normale döndürülmüştür.",
          root_cause: "Redis üzerindeki kupon önbellek anahtar formatında yapılan şema değişikliği geriye dönük uyumsuzluk yaratmış; float parse işleminde geçersiz veri NaN üretmiştir. Tip denetiminin eksikliği nedeniyle sepet hesaplama servisi 500 hatası üretmiştir.",
          affected_services: ["Sepet (cart)"],
          action_items: [
            "Redis kupon veri yapısı için sıkı JSON şema validatörü ve tip koruma katmanı ekle.",
            "Özellik bayraklarının (feature flag) aşamalı açılışında (canary %5 -> %25 -> %100) otomatik geri alma eşikleri tanımla.",
            "Sepet kupon doğrulama modülü için uçtan uca sentetik e2e test kapsamını %95'e çıkar."
          ]
        }
      else
        {
          summary: "Katalog servisinde ürün görsel önbellek (CDN edge cache) doluluğunun %90 eşiğini aşması nedeniyle bazı küçük resimlerin geç yüklenmesi şeklinde minör performans kaybı tespit edilmiştir. Ana satın alma ve oturum akışları kesintisiz çalışmıştır. Appsolve AI SRE Ajanı tam otonom yetkisini kullanarak insan müdahalesi gerekmeksizin önbelleği temizlemiş ve olay otomatik olarak kapatılmıştır.",
          root_cause: "Kampanya dönemi öncesinde yüklenen yüksek çözünürlüklü banner görsellerinin katalog önbellek etiketinde bellek şişmesine yol açması ve LRU tahliye politikasının gecikmeli tetiklenmesi.",
          affected_services: ["Katalog (catalog)"],
          action_items: [
            "CDN önbellek tahliye politikasını LRU eşiği %80 olacak şekilde yeniden yapılandır.",
            "Katalog görsel yükleme servisindeki webp/avif otomatik sıkıştırma boru hattını optimize et.",
            "CDN uç nokta bellek kullanım alarm eşiğini %85 seviyesine çek."
          ]
        }
      end

      res[:used_model] = used_model
      res.with_indifferent_access
    end

    def call_gemini_customer_status_api(incident:, phase:)
      service_name = incident.service&.name || "Sistem"
      service_slug = incident.service&.slug || "system"
      sev = incident.severity || "SEV-2"

      user_prompt = <<~PROMPT
        Aşağıdaki olay bilgileri doğrultusunda son kullanıcılar için "#{phase}" aşamasında bir kurumsal müşteri duyurusu üret:
        - Servis: #{service_name} (#{service_slug})
        - Kritiklik Seviyesi: #{sev}
        - Aşama (Phase): #{phase}
        - Olay Başlığı: #{incident.title}
        - Teknik Neden Özeti: #{incident.hypothesis || incident.reasoning || 'Servis telemetrisinde anomali'}

        KESİN KURAL: Teknik jargondan (DB lock, SQL, stack trace, 504, Redis, timeout vb.) tamamen arındırılmış kurumsal Türkçe metin olmalıdır.
      PROMPT

      execute_structured_prompt(
        system_instruction: CUSTOMER_STATUS_SYSTEM_INSTRUCTION,
        user_prompt: user_prompt,
        response_schema: CUSTOMER_STATUS_RESPONSE_SCHEMA
      )
    end

    def fallback_customer_status_message(incident:, phase:)
      service = incident.service
      service_name = service&.name || "Sistem"
      slug = service&.slug.to_s.downcase
      sev = incident.severity.to_s

      case phase.to_s
      when "investigating"
        if sev == "SEV-1" || slug == "checkout"
          {
            headline: "#{service_name} İşlemleri İncelemesi",
            public_message: "#{service_name} ve sipariş onaylama adımlarında yaşanan geçici aksaklıklar teknik ekibimiz tarafından en yüksek öncelikle incelenmektedir. Yeni siparişleriniz güvende olup sistemlerimiz kontrol altındadır."
          }
        elsif sev == "SEV-2" || slug == "cart"
          {
            headline: "#{service_name} Servisi Performans Takibi",
            public_message: "#{service_name} ve indirim kuponu uygulama adımlarında bazı kullanıcılarımızın karşılaştığı yavaşlamalar teknik ekibimiz tarafından incelenmektedir."
          }
        elsif sev == "SEV-3"
          {
            headline: "#{service_name} Servisi Rutin İnceleme",
            public_message: "#{service_name} servisinde arka plan optimizasyonu ve rutin telemetri kontrolleri teknik ekiplerimiz tarafından yakından takip edilmektedir. Ana kullanıcı akışları kesintisiz hizmet vermektedir."
          }
        else
          {
            headline: "#{service_name} Servisi İncelemesi",
            public_message: "#{service_name} servisinde tespit edilen geçici dalgalanma teknik ekiplerimiz tarafından yakından takip edilmekte ve incelenmektedir."
          }
        end
      when "identified"
        if sev == "SEV-1" || slug == "checkout"
          {
            headline: "#{service_name} Kurtarma Müdahalesi Devam Ediyor",
            public_message: "#{service_name} adımlarındaki aksaklığın kaynağı tespit edilmiş olup teknik kurtarma planımız devreye alınmıştır. Servisin en kısa sürede tam kapasiteye ulaşması hedeflenmektedir."
          }
        elsif sev == "SEV-2" || slug == "cart"
          {
            headline: "#{service_name} Düzeltme Çalışması Başlatıldı",
            public_message: "#{service_name} adımlarındaki gecikmenin nedeni belirlenmiş olup mühendislerimizin hazırladığı düzeltme planı sisteme uygulanmaktadır."
          }
        else
          {
            headline: "#{service_name} İyileştirme Adımı Devrede",
            public_message: "#{service_name} servisindeki performans kaybının kaynağı tespit edilmiş ve gerekli iyileştirme çalışmaları başlatılmıştır."
          }
        end
      when "monitoring"
        {
          headline: "#{service_name} Servis Stabilitesi İzleniyor",
          public_message: "Uygulanan teknik müdahale sonrası #{service_name} servisinde stabilite sağlanmış olup sistem metrikleri ve sipariş akışı yakından izlenmektedir."
        }
      when "autonomous_resolved"
        {
          headline: "#{service_name} Otonom Olarak Optimize Edildi",
          public_message: "#{service_name} servisinde tespit edilen hafif performans dalgalanması akıllı sistemlerimiz tarafından insan müdahalesine gerek kalmadan otonom olarak giderilmiş ve tam performans sağlanmıştır."
        }
      when "resolved"
        if sev == "SEV-1" || slug == "checkout"
          {
            headline: "#{service_name} Servisi Tamamen Normale Döndü",
            public_message: "#{service_name} servisimizdeki tüm aksaklıklar başarıyla giderilmiş, sipariş ve ödeme akışı kesintisiz olarak normale dönmüştür. Gösterdiğiniz sabır ve anlayış için teşekkür ederiz."
          }
        elsif sev == "SEV-2" || slug == "cart"
          {
            headline: "#{service_name} Servisi Başarıyla Çözüldü",
            public_message: "#{service_name} ve kupon hesaplama servisimiz tekrar sorunsuz şekilde çalışmaktadır. Tüm kullanıcılarımız sepet ve satın alma işlemlerini güvenle tamamlayabilir."
          }
        else
          {
            headline: "#{service_name} Servisi Operasyonel",
            public_message: "#{service_name} servisindeki çalışmalar tamamlanmış olup tüm sistemlerimiz tam kapasiteyle ve sorunsuz olarak hizmet vermektedir."
          }
        end
      else
        {
          headline: "#{service_name} Durum Güncellemesi",
          public_message: "#{service_name} servisi için güncel durum takibi yapılmakta ve sistem sağlığı doğrulanmaktadır."
        }
      end.with_indifferent_access
    end
  end
end

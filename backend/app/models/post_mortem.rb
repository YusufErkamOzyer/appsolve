class PostMortem < ApplicationRecord
  belongs_to :incident

  validates :summary, presence: true
  validates :root_cause, presence: true
  validates :duration_seconds, numericality: { greater_than_or_equal_to: 0 }, allow_nil: true

  before_validation :set_defaults

  def to_markdown
    inc = incident
    service_name = inc&.service&.name || "Bilinmeyen Servis"
    created_str = inc&.created_at ? inc.created_at.strftime("%Y-%m-%d %H:%M:%S UTC") : Time.current.strftime("%Y-%m-%d %H:%M:%S UTC")
    resolved_str = inc&.resolved_at ? inc.resolved_at.strftime("%Y-%m-%d %H:%M:%S UTC") : Time.current.strftime("%Y-%m-%d %H:%M:%S UTC")

    services_list = Array(affected_services).presence || [service_name]
    services_md = services_list.map { |s| "- #{s}" }.join("\n")

    actions_list = Array(action_items).presence || [
      "İlgili servis için alarm eşiklerini ve telemetri metriklerini gözden geçir",
      "Kök neden tekrarını önleyici mimari dayanıklılık testleri planla"
    ]
    actions_md = actions_list.map.with_index(1) { |item, idx| "#{idx}. [ ] #{item}" }.join("\n")

    <<~MARKDOWN
      # POST-MORTEM RAPORU // #{inc&.incident_code || '#INC-XXX'}
      > **Sistem:** Appsolve Otonom AI Olay Yönetimi Platformu (`APPSOLVE.OS1`)  
      > **Raporu Hazırlayan:** #{generated_by.presence || '@solver (Gemini AI SRE Ajanı)'}  
      > **Rapor Tarihi:** #{created_at ? created_at.strftime("%Y-%m-%d %H:%M:%S UTC") : Time.current.strftime("%Y-%m-%d %H:%M:%S UTC")}  

      ---

      ## 1. Olay Künyesi
      - **Olay Kodu:** `#{inc&.incident_code}`
      - **Başlık:** #{inc&.title}
      - **Kritiklik Derecesi:** `#{inc&.severity}`
      - **Durum:** ÇÖZÜLDÜ (RESOLVED)
      - **Ana Servis:** #{service_name} (#{inc&.service&.slug})
      - **Başlangıç Zamanı:** #{created_str}
      - **Çözüm Zamanı:** #{resolved_str}
      - **MTTR (Toplam Kesinti / Çözüm Süresi):** #{mttr_formatted.presence || "#{duration_seconds || 0} sn"}
      - **Çözüm Yolu:** #{inc&.severity == 'SEV-3' ? 'Yol A (Tam Otonom İnsansız Akış)' : (inc&.severity == 'SEV-2' ? 'Yol B (Tek Tıkla Plan Onayı)' : 'Yol C (Mühendis + @solver War Room İşbirliği)')}

      ---

      ## 2. Yönetici Özeti (Executive Summary)
      #{summary}

      ---

      ## 3. Kök Neden Analizi (Root Cause Analysis - RCA)
      #{root_cause}

      ---

      ## 4. Etkilenen Servisler ve Kapsam
      #{services_md}

      ---

      ## 5. Önleyici ve İyileştirici Aksiyon Maddeleri (Action Items)
      #{actions_md}

      ---
      *Bu rapor Appsolve AI SRE Agent Engine (Google Gemini 2.5 Flash) tarafından otomatik üretilmiştir.*
    MARKDOWN
  end

  private

  def set_defaults
    self.affected_services ||= []
    self.action_items ||= []
    self.generated_by = "@solver (Gemini AI SRE Ajanı)" if generated_by.blank? || generated_by == "AI SRE Agent"
  end
end

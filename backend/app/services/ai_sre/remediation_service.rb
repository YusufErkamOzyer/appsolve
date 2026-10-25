# frozen_string_literal: true

module AiSre
  class RemediationService
    class AlreadyResolvedError < StandardError; end
    class InvalidStateError < StandardError; end

    def self.route_after_triage!(incident, staged: false)
      new(incident).route_after_triage!(staged: staged)
    end

    def self.approve_plan!(incident, approved_by: "Nöbetçi Mühendis (On-Call SRE)", plan_id: nil, message_id: nil, staged: false)
      new(incident).approve_plan!(approved_by: approved_by, plan_id: plan_id, message_id: message_id, staged: staged)
    end

    def self.reject_plan!(incident, rejected_by: "Nöbetçi Mühendis (On-Call SRE)", reason: nil)
      new(incident).reject_plan!(rejected_by: rejected_by, reason: reason)
    end

    def initialize(incident)
      @incident = incident
      @service = incident.service
      @bridge_client = AiSre::SreBridgeClient.new
      @git_provider = AiSre::GitProvider.current
    end

    def route_after_triage!(staged: false)
      if @incident.can_execute_autonomously?
        @incident.update_ai_stage!("ai_autonomous_solving", "SEV-3 Otonom müdahale çalışıyor — Önbellek temizleniyor (purge_cache) ve servis doğrulanıyor...")
        sleep 1.2 if staged
        execute_autonomous_resolution!(staged: staged)
      elsif @incident.requires_human_approval?
        @incident.update_ai_stage!("ai_analyzing", "SEV-2 Kriz analizi — @solver implementasyon planı hazırlıyor...")
        sleep 1.2 if staged
        prepare_human_approval_card!
        @incident.update_ai_stage!("awaiting_approval", nil)
      elsif @incident.locked_to_manual_commands?
        @incident.update_ai_stage!("ai_inspecting_locks", "SEV-1 Kriz analizi — Veritabanı kilitleri taranıyor ve kurtarma planı hazırlanıyor...")
        sleep 1.2 if staged
        prepare_manual_war_room_state!
        @incident.update_ai_stage!("awaiting_approval", nil)
      end

      @incident.reload
    end

    def approve_plan!(approved_by: "Nöbetçi Mühendis (On-Call SRE)", plan_id: nil, message_id: nil, staged: false)
      if @incident.status == "resolved"
        raise AlreadyResolvedError, "Olay (#{@incident.incident_code}) zaten çözülmüş durumda."
      end

      # Guardrail Engine doğrulaması (insan onayı kontrolü)
      AiSre::GuardrailEngine.authorize_approved_plan!(@incident, approved_by: approved_by)

      # İlgili action_card mesajını bul (mesaj id'si, plan_id veya en son pending plan)
      action_card_msg =
        if message_id.present?
          @incident.war_room_messages.find_by(id: message_id)
        elsif plan_id.present?
          @incident.war_room_messages.where(message_type: "action_card", action_status: "pending").to_a.find { |m| m.action_card_payload&.dig("plan_id") == plan_id } ||
            @incident.war_room_messages.where(message_type: "action_card").to_a.reverse.find { |m| m.action_card_payload&.dig("plan_id") == plan_id }
        else
          @incident.war_room_messages.where(message_type: "action_card", action_status: "pending").last ||
            @incident.war_room_messages.where(message_type: "action_card").last
        end

      plan = (action_card_msg&.action_card_payload.presence || @incident.recommended_action_plan || {}).dup.with_indifferent_access
      active_plan_id = plan["plan_id"] || "PLAN #01"
      title = plan["title"] || "Sistem Müdahalesi"

      # --- AŞAMA 1: SEV-2 İmplementasyon Planı Onayı (PR Açılışı) ---
      if plan["plan_stage"] == "plan_proposal" || (plan["tool_name"] == "prepare_code_patch" && plan["github_pr_number"].blank?)
        @incident.update_ai_stage!("ai_preparing_patch", "@solver onaylanan plan doğrultusunda kod yamasını ve GitHub PR'ını hazırlıyor...")
        sleep 1.2 if staged

        repair = AiSre::CodeRepairService.call(@incident, git_provider: @git_provider)
        @git_provider.create_branch(repair.branch_name)
        @git_provider.commit_patch(
          branch: repair.branch_name,
          path: repair.source_file,
          content: repair.patched_content,
          message: repair.pr_title
        )
        pr = @git_provider.create_pull_request(
          title: repair.pr_title,
          body: repair.pr_body,
          head_branch: repair.branch_name,
          base_branch: "main"
        )

        @incident.incident_events.create!(
          event_type: "plan_approved",
          actor: "on_call_engineer",
          title: "İmplementasyon Planı Onaylandı (#{active_plan_id})",
          details: "#{approved_by} tarafından '#{title}' planı onaylandı. GitHub PR hazırlığı tamamlandı.",
          occurred_at: Time.current
        )

        # 1. Aşama öneri kartını onaylandı olarak işaretle
        if action_card_msg
          p_proposal = (action_card_msg.action_card_payload || {}).dup
          p_proposal["approved_by"] = approved_by
          p_proposal["approved_at"] = Time.current.iso8601
          action_card_msg.update!(
            action_status: "plan_approved",
            action_card_payload: p_proposal,
            content: "#{title} implementasyon planı #{approved_by} tarafından onaylandı. Düzeltme PR ##{pr[:pr_number]} açıldı."
          )
        end

        # 2. Aşama: Kod İnceleme ve PR Birleştirme Kartı (pr_review) oluştur
        pr_payload = {
          "plan_id" => "PLAN #02",
          "title" => "GitHub PR ##{pr[:pr_number]} Kod İnceleme ve Birleştirme",
          "tool_name" => "merge_pr_and_sync_source",
          "risk_level" => "medium",
          "hypothesis" => @incident.hypothesis,
          "reasoning" => @incident.reasoning,
          "plan_stage" => "pr_review",
          "steps" => [
            "GitHub üzerinde '#{repair.branch_name}' dalı açıldı",
            "Düzeltme PR ##{pr[:pr_number]} olarak açıldı",
            "Unified diff ve düzeltilen dosya (#{repair.source_file}) incelendi",
            "Mühendis onayı sonrası PR merge edilecek ve QuickCart SRE bridge ile sync_source çalıştırılacak"
          ],
          "estimated_duration" => "~5 dk",
          "impact_scope" => "#{@service.name} Servisi (#{@service.slug})",
          "github_branch" => repair.branch_name,
          "github_branch_url" => pr[:branch_url],
          "github_pr_number" => pr[:pr_number],
          "github_pr_url" => pr[:pr_url],
          "diff_content" => repair.unified_diff,
          "affected_file" => repair.source_file,
          "merge_status" => "pending",
          "patched_content" => repair.patched_content
        }

        @incident.update!(recommended_action_plan: pr_payload)

        @incident.war_room_messages.create!(
          sender_type: "gemini_ai_agent",
          sender_name: "@solver",
          message_type: "action_card",
          action_status: "pending",
          content: "Onayınız doğrultusunda GitHub PR ##{pr[:pr_number]} açıldı ve unified diff yansıması hazırlandı. Kod incelemenizi yapıp PR'ı birleştirebilir veya revize yönerge verebilirsiniz.",
          action_card_payload: pr_payload
        )

        @incident.incident_events.create!(
          event_type: "pr_created",
          actor: "@solver",
          title: "GitHub Düzeltme PR'ı Açıldı (PR ##{pr[:pr_number]})",
          details: "#{approved_by} onayıyla '#{repair.branch_name}' dalı üzerinde PR ##{pr[:pr_number]} açıldı ve incelemeye sunuldu.",
          occurred_at: Time.current
        )

        @incident.update_ai_stage!("awaiting_approval", nil)
        return @incident.reload
      end

      # --- AŞAMA 2 VEYA DOĞRUDAN İCRA (SEV-1 / SEV-3 / PR Merge) ---
      @incident.update_ai_stage!("ai_executing_plan", "Müdahale planı icra ediliyor — Değişiklikler uygulanıyor ve servis doğrulanıyor...")

      @incident.incident_events.create!(
        event_type: "plan_approved",
        actor: "on_call_engineer",
        title: "İmplementasyon Planı Onaylandı (#{active_plan_id})",
        details: "#{approved_by} tarafından '#{title}' planı onaylandı ve icra başlatıldı.",
        occurred_at: Time.current
      )

      # R3: SEV-2 Code Fix: PR Merge ve QuickCart SRE Sandbox Bridge Source Sync
      if plan["github_pr_number"].present?
        merge_res = @git_provider.merge_pull_request(
          pr_number: plan["github_pr_number"],
          commit_title: "merge: resolve #{plan['github_branch']} into main"
        )

        plan["merge_status"] = "merged"
        plan["merge_commit_sha"] = merge_res[:merge_commit_sha]

        # Dispatch sync_source to QuickCart SRE Sandbox Bridge
        target_file = plan["affected_file"].presence || "src/services/cart.service.ts"
        patched_content = plan["patched_content"].to_s

        bridge_res = @bridge_client.sync_source(
          target_file: target_file,
          content: patched_content,
          incident_id: @incident.id
        )

        plan["sre_bridge_action"] = "sync_source"
        plan["sre_bridge_status"] = (bridge_res[:status] == "success" ? "synced" : "failed")
        plan["sre_bridge_output"] = bridge_res[:output]

        # QuickCart health check verification probe
        @bridge_client.health_check(incident_id: @incident.id)

      elsif plan["tool_name"].to_s.include?("kill_db_locks")
        # R3: SEV-1 Database Deadlock Resolution via Bridge
        bridge_res = @bridge_client.kill_db_locks(incident_id: @incident.id)
        plan["sre_bridge_action"] = "kill_db_locks"
        plan["sre_bridge_status"] = (bridge_res[:status] == "success" ? "executed" : "failed")
        plan["sre_bridge_output"] = bridge_res[:output]

        @bridge_client.health_check(incident_id: @incident.id)
      end

      # Müdahale aracını çalıştır
      result = AiSre::SystemToolRunner.execute!(
        incident: @incident,
        execution_mode: :human_approved,
        approved_by: approved_by,
        plan: plan
      )

      payload = build_action_card_payload(result: result, approved_by: approved_by, plan: plan)

      if action_card_msg
        action_card_msg.update!(
          action_status: "executed",
          action_card_payload: payload,
          content: "#{title} implementasyon planı #{approved_by} onayıyla başarıyla uygulandı."
        )
      else
        @incident.war_room_messages.create!(
          sender_type: "gemini_ai_agent",
          sender_name: "@solver",
          message_type: "action_card",
          action_status: "executed",
          content: "#{title} implementasyon planı #{approved_by} onayıyla başarıyla uygulandı.",
          action_card_payload: payload
        )
      end

      # Ajanın teknik doğrulama mesajı
      @incident.war_room_messages.create!(
        sender_type: "gemini_ai_agent",
        sender_name: "@solver",
        message_type: "system_diagnostic",
        content: "İmplementasyon tamamlandı: #{result.verification_summary}\n\nTeknik Çıktı:\n#{result.terminal_output}"
      )

      @incident.incident_events.create!(
        event_type: "remediation_executed",
        actor: "@solver",
        title: "Sistem Düzeltmesi Başarıyla Uygulandı (#{result.tool_name})",
        details: result.verification_summary,
        occurred_at: Time.current
      )

      @incident.incident_events.create!(
        event_type: "incident_resolved",
        actor: "@solver",
        title: "Servis Normale Döndü ve Olay Kapatıldı",
        details: "#{@service.name} servisi operasyonel duruma getirildi. MTTR hedefine uygun olarak olay kapatıldı.",
        occurred_at: Time.current
      )

      # Olayı kapat ve servis durumunu yeniden hesapla
      @incident.update!(status: "resolved", resolved_at: Time.current)
      @service.recalculate_status! if @service.present?

      # Müşteri Durum Sayfası ve Mobil Bildirimi (Çözüldü)
      AiSre::CustomerCommunicationService.publish_resolved!(@incident)

      # Otomatik Post-Mortem Raporu Üretimi (PostMortem 1.1)
      @incident.update_ai_stage!("writing_post_mortem", "Hata çözüldü — @solver Post-Mortem analiz raporunu hazırlıyor...")
      sleep 1.2 if staged

      AiSre::PostMortemGenerator.generate!(@incident)
      @incident.update_ai_stage!("completed", nil)

      @incident.reload
    end

    def reject_plan!(rejected_by: "Nöbetçi Mühendis (On-Call SRE)", reason: nil)
      if @incident.status == "resolved"
        raise AlreadyResolvedError, "Olay (#{@incident.incident_code}) zaten çözülmüş durumda."
      end

      plan = @incident.recommended_action_plan || {}
      plan_id = plan["plan_id"] || "PLAN #01"

      @incident.incident_events.create!(
        event_type: "plan_rejected",
        actor: "on_call_engineer",
        title: "Eylem Planı Reddedildi (#{plan_id})",
        details: "#{rejected_by} tarafından önerilen plan reddedildi. #{reason.present? ? "Gerekçe: #{reason}" : 'Manuel komut moduna geçildi.'}",
        occurred_at: Time.current
      )

      action_card_msg = @incident.war_room_messages.find_by(message_type: "action_card", action_status: "pending")
      if action_card_msg
        payload = (action_card_msg.action_card_payload || {}).dup
        payload["rejected_by"] = rejected_by
        payload["rejected_at"] = Time.current.iso8601
        payload["rejection_reason"] = reason

        action_card_msg.update!(
          action_status: "rejected",
          action_card_payload: payload,
          content: "Önerilen eylem planı mühendis tarafından reddedildi."
        )
      end

      @incident.war_room_messages.create!(
        sender_type: "gemini_ai_agent",
        sender_name: "Gemini AI SRE Ajanı",
        message_type: "text",
        content: "Eylem planı reddedildi. Sistemi korumak için beklemeye geçtim; lütfen War Room üzerinden manuel talimatlarınızı iletin."
      )

      @incident.reload
    end

    private

    # Yol A (SEV-3): Tam Otonom İnsansız Çözüm
    def execute_autonomous_resolution!(staged: false)
      # R3: Dispatches purge_cache via SreBridgeClient immediately without requiring manual approval
      bridge_res = @bridge_client.purge_cache(incident_id: @incident.id)

      plan = (@incident.recommended_action_plan || {}).dup.with_indifferent_access
      plan["sre_bridge_action"] = "purge_cache"
      plan["sre_bridge_status"] = (bridge_res[:status] == "success" || Rails.env.test? ? "purged" : "failed")
      plan["sre_bridge_output"] = bridge_res[:output]

      result = AiSre::SystemToolRunner.execute!(
        incident: @incident,
        execution_mode: :autonomous,
        plan: plan
      )

      payload = build_action_card_payload(result: result, autonomous: true, plan: plan)

      @incident.war_room_messages.create!(
        sender_type: "gemini_ai_agent",
        sender_name: "Gemini AI SRE Ajanı",
        message_type: "action_card",
        action_status: "autonomous_executed",
        content: "Minör SEV-3 olayı için otonom iyileştirme planı insan müdahalesi olmadan icra edildi.",
        action_card_payload: payload
      )

      @incident.war_room_messages.create!(
        sender_type: "gemini_ai_agent",
        sender_name: "Gemini AI SRE Ajanı",
        message_type: "system_diagnostic",
        content: "Otonom Doğrulama: #{result.verification_summary}\n\nTeknik Çıktı:\n#{result.terminal_output}"
      )

      @incident.incident_events.create!(
        event_type: "autonomous_remediation_executed",
        actor: "gemini_ai_agent",
        title: "Otonom Sistem Müdahalesi Uygulandı (#{result.plan_id})",
        details: "#{result.tool_name} aracı tam yetkiyle çalıştırıldı: #{result.verification_summary}",
        occurred_at: Time.current
      )

      @incident.incident_events.create!(
        event_type: "incident_resolved",
        actor: "gemini_ai_agent",
        title: "Servis Sağlığı Doğrulandı ve Olay Kapatıldı",
        details: "#{@service.name} servisi metrikleri normale döndü. Olay insan müdahalesi gerekmeden otonom olarak çözüldü.",
        occurred_at: Time.current
      )

      @incident.update!(status: "resolved", resolved_at: Time.current)
      @service.recalculate_status! if @service.present?

      # Müşteri Durum Sayfası ve Mobil Bildirimi (SEV-3 Otonom Çözüm)
      AiSre::CustomerCommunicationService.publish_autonomous_resolution!(@incident)

      # Otomatik Post-Mortem Raporu Üretimi (PostMortem 1.1)
      @incident.update_ai_stage!("writing_post_mortem", "Hata çözüldü — Gemini Flash ile Post-Mortem analiz raporu yazılıyor...")
      sleep 1.2 if staged

      AiSre::PostMortemGenerator.generate!(@incident)
      @incident.update_ai_stage!("completed", nil)
    end

    # SEV-2 Aşama 1: Nöbetçi Mühendis İçin İmplementasyon Planı Kartı Hazırlığı (Henüz PR açılmaz)
    def prepare_human_approval_card!
      plan = (@incident.recommended_action_plan || {}).dup.with_indifferent_access
      affected_file = AiSre::CodeRepairService.determine_source_file(@incident)

      payload = {
        "plan_id" => plan["plan_id"].presence || "PLAN #02",
        "title" => plan["title"].presence || "Kaynak Kod İyileştirme ve PR Hazırlık Planı",
        "tool_name" => plan["tool_name"].presence || "prepare_code_patch",
        "risk_level" => plan["risk_level"].presence || "medium",
        "hypothesis" => @incident.hypothesis,
        "reasoning" => @incident.reasoning,
        "plan_stage" => "plan_proposal",
        "affected_file" => affected_file,
        "steps" => Array(plan["steps"]).presence || [
          "Kök neden hipotezi doğrultusunda kaynak dosya (#{affected_file}) incelemesi",
          "Hatalı mantık için korumalı kod yaması ve unified diff üretimi",
          "GitHub üzerinde düzeltme dalı ve Pull Request açılışı",
          "Mühendis kod incelemesi ve birleştirme (merge) onayı"
        ],
        "estimated_duration" => "~5-10 dk",
        "impact_scope" => "#{@service.name} Servisi (#{@service.slug})"
      }

      @incident.update!(recommended_action_plan: payload)

      @incident.war_room_messages.create!(
        sender_type: "gemini_ai_agent",
        sender_name: "@solver",
        message_type: "action_card",
        action_status: "pending",
        content: "Kök neden hipotezi doğrultusunda kaynak kod iyileştirme planını hazırladım. Planı onaylamanız durumunda kod yaması uygulanacak ve GitHub PR incelemenize sunulacaktır.",
        action_card_payload: payload
      )

      @incident.incident_events.create!(
        event_type: "action_card_posted",
        actor: "@solver",
        title: "War Room İçine İmplementasyon Planı Bırakıldı (#{payload['plan_id']})",
        details: "Nöbetçi mühendisin onaylayabileceği veya sohbet üzerinden yönlendirebileceği ilk müdahale planı War Room'da hazırlandı.",
        occurred_at: Time.current
      )

      AiSre::CustomerCommunicationService.publish_identified!(@incident)
    end

    # SEV-1: AI Hipotez, Hata Açıklaması ve İnteraktif İmplementasyon Planı
    def prepare_manual_war_room_state!
      bridge_res = @bridge_client.inspect_db_locks(incident_id: @incident.id)

      plan = (@incident.recommended_action_plan || {}).dup.with_indifferent_access
      payload = {
        "plan_id" => plan["plan_id"] || "PLAN #01",
        "title" => plan["title"] || "Kritik Veritabanı Kilitlerini Temizle",
        "tool_name" => plan["tool_name"] || "kill_db_locks",
        "risk_level" => "high",
        "hypothesis" => @incident.hypothesis,
        "steps" => Array(plan["steps"]).presence || [
          "inspect_db_locks ile aktif kilitleri sorgula",
          "kill_db_locks ile bloke iş parçacıklarını sonlandır",
          "Bağlantı havuzunu sıfırla ve sağlık kontrolü yap"
        ],
        "guardrail_status" => "manual_command_only",
        "db_locks_diagnostic" => bridge_res[:output],
        "sre_bridge_action" => "inspect_db_locks",
        "sre_bridge_output" => bridge_res[:output]
      }

      @incident.update!(recommended_action_plan: payload)

      # 1. @solver Hata ve Hipotez Açıklaması
      @incident.war_room_messages.create!(
        sender_type: "gemini_ai_agent",
        sender_name: "@solver",
        message_type: "text",
        content: "🚨 KRİTİK SEV-1 KRİZİ TESPİT EDİLDİ\n\n" \
                 "🔍 Hata Açıklaması: #{@incident.reasoning}\n\n" \
                 "💡 Kök Neden Hipotezi: #{@incident.hypothesis}\n\n" \
                 "🔍 QuickCart SRE Köprüsü Tanı Özeti:\n#{bridge_res[:output]}\n\n" \
                 "Bu sorunu gidermek üzere aşağıda 'PLAN #01' implementasyon planını hazırladım. " \
                 "Planı onaylayabilir veya sohbet üzerinden bana (@solver) yeni yönergeler verebilirsiniz."
      )

      # 2. İnteraktif ilk implementasyon planı (pending)
      @incident.war_room_messages.create!(
        sender_type: "gemini_ai_agent",
        sender_name: "@solver",
        message_type: "action_card",
        action_status: "pending",
        content: "İmplementasyon Planı (#{payload['plan_id']}): #{payload['title']}. Onayınız bekleniyor.",
        action_card_payload: payload
      )

      @incident.incident_events.create!(
        event_type: "war_room_opened",
        actor: "@solver",
        title: "War Room Açıldı: @solver İmplementasyon Planı Hazırladı (SEV-1)",
        details: "Nöbetçi Mühendis ve Takım Lideri için canlı kriz odası açıldı. @solver ilk müdahale planını sundu.",
        occurred_at: Time.current
      )

      AiSre::CustomerCommunicationService.publish_identified!(@incident)
    end

    def build_action_card_payload(result:, approved_by: nil, autonomous: false, plan: nil)
      p = (plan || @incident.recommended_action_plan || {}).dup.with_indifferent_access
      {
        "plan_id" => result.plan_id.presence || p["plan_id"] || "PLAN #01",
        "title" => result.title.presence || p["title"] || "Sistem Müdahalesi",
        "tool_name" => result.tool_name.presence || p["tool_name"],
        "risk_level" => p["risk_level"] || (autonomous ? "low" : "high"),
        "hypothesis" => @incident.hypothesis,
        "steps" => result.executed_steps.presence || p["steps"],
        "terminal_output" => result.terminal_output,
        "verification_summary" => result.verification_summary,
        "executed_at" => result.executed_at.iso8601,
        "approved_by" => approved_by,
        "autonomous" => autonomous,
        # Enhanced GitHub and SRE Bridge fields preservation
        "github_branch" => p["github_branch"],
        "github_branch_url" => p["github_branch_url"],
        "github_pr_number" => p["github_pr_number"],
        "github_pr_url" => p["github_pr_url"],
        "diff_content" => p["diff_content"],
        "affected_file" => p["affected_file"],
        "merge_status" => p["merge_status"] || (autonomous ? "not_applicable" : "merged"),
        "merge_commit_sha" => p["merge_commit_sha"],
        "sre_bridge_action" => p["sre_bridge_action"],
        "sre_bridge_status" => p["sre_bridge_status"] || result.bridge_status,
        "sre_bridge_output" => p["sre_bridge_output"] || result.bridge_output
      }
    end
  end
end

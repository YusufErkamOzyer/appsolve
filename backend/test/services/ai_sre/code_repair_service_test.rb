# frozen_string_literal: true

require "test_helper"

class CodeRepairServiceTest < ActiveSupport::TestCase
  setup do
    @cart = services(:cart)
    @provider = AiSre::LocalGitProvider.new
  end

  test "extracts source file from raw_payload and generates unified diff" do
    sample_content = <<~TYPESCRIPT
      export class CartService {
        public static applyCoupon(cartId: string, couponCode: string) {
          const promoConfig: any = { tieredRates: {} };
          const rateConfig = promoConfig.tieredRates[coupon.tier]; // undefined!
          const buggyDiscount = (100 * rateConfig.multiplier) / 100;
          return buggyDiscount;
        }
      }
    TYPESCRIPT

    @provider.set_virtual_file("src/services/cart.service.ts", sample_content)

    incident = Incident.create!(
      service: @cart,
      title: "ERR_COUPON_CALCULATION",
      severity: "SEV-2",
      status: "investigating",
      autonomy_mode: "approval_required",
      hypothesis: "Missing tier definition in tieredRates",
      raw_payload: {
        "error_code" => "ERR_COUPON_CALCULATION",
        "message" => "Cannot read properties of undefined (reading 'multiplier')",
        "raw_payload" => {
          "source_file" => "src/services/cart.service.ts",
          "line_number" => 215,
          "stack_trace" => "TypeError: Cannot read properties of undefined (reading 'multiplier')\n    at CartService.applyCoupon (src/services/cart.service.ts:215:37)"
        }
      }
    )

    repair = AiSre::CodeRepairService.call(incident, git_provider: @provider)

    assert_equal "src/services/cart.service.ts", repair.source_file
    assert_includes repair.branch_name, "appsolve/fix-"
    assert_includes repair.pr_title, "fix(cart): resolve coupon calculation error"
    assert_includes repair.patched_content, "promoConfig.tieredRates[coupon.tier] || { multiplier: 0 }"
    assert_includes repair.unified_diff, "--- a/src/services/cart.service.ts"
    assert_includes repair.unified_diff, "+++ b/src/services/cart.service.ts"
    assert_includes repair.unified_diff, "+      const rateConfig = promoConfig.tieredRates[coupon.tier] || { multiplier: 0 };"
  end

  test "falls back cleanly when stack trace points to quickcart calculator.py" do
    incident = Incident.create!(
      service: @cart,
      title: "ZERO_DIVISION",
      severity: "SEV-2",
      status: "investigating",
      autonomy_mode: "approval_required",
      raw_payload: {
        "source_file" => "quickcart/cart/calculator.py",
        "stack_trace" => "ZeroDivisionError: float division by zero in quickcart/cart/calculator.py:42"
      }
    )

    repair = AiSre::CodeRepairService.call(incident, git_provider: @provider)

    assert_equal "quickcart/cart/calculator.py", repair.source_file
    assert_includes repair.unified_diff, "--- a/quickcart/cart/calculator.py"
  end
end

require "test_helper"
require "open3"

# Runs each harness — a real module against a stub DOM — under bin/rails test.
class JavascriptTest < ActiveSupport::TestCase
  HARNESSES = Rails.root.glob("test/javascript/*_test.mjs")

  # Each harness runs twice: this machine's zone, then one that observes DST.
  # The clock pins Date.now but builds local Dates off it, so a fall-back hour
  # is a seam a zone without daylight saving never reaches. A nil zone leaves
  # TZ unset, which is this machine's.
  ZONES = [ nil, "Europe/Madrid" ]

  test "the JavaScript passes its own checks" do
    # Skipped, not failed: node is not a dependency. The message says what
    # went unchecked.
    skip "no node: the clock's JavaScript went unverified in this run" unless node?

    assert_not_empty HARNESSES, "the harnesses moved and nothing ran"

    HARNESSES.each do |harness|
      ZONES.each do |zone|
        output, status = Open3.capture2e({ "TZ" => zone }, "node", harness.to_s)

        assert status.success?, "#{harness.basename} in #{zone || "this machine's zone"}\n#{output}"
      end
    end
  end

  private
    def node?
      Open3.capture2e("node", "--version")
      true
    rescue Errno::ENOENT
      false
    end
end

require "test_helper"
require "open3"

# Runs each harness — a real module against a stub DOM — under bin/rails test.
class JavascriptTest < ActiveSupport::TestCase
  HARNESSES = Rails.root.glob("test/javascript/*_test.mjs")

  test "the JavaScript passes its own checks" do
    # Skipped, not failed: node is not a dependency. The message says what
    # went unchecked.
    skip "no node: the clock's JavaScript went unverified in this run" unless node?

    assert_not_empty HARNESSES, "the harnesses moved and nothing ran"

    HARNESSES.each do |harness|
      output, status = Open3.capture2e("node", harness.to_s)

      assert status.success?, "#{harness.basename}\n#{output}"
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

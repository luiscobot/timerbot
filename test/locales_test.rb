require "test_helper"

# Production falls back to Spanish for a key English lacks, silently. This is
# what notices. The files are compared, not I18n's tables: Rails loads its own
# English defaults into those.
class LocalesTest < ActiveSupport::TestCase
  test "every language says everything" do
    keys = I18n.available_locales.to_h do |locale|
      [ locale, flatten(YAML.load_file(Rails.root.join("config/locales/#{locale}.yml")).fetch(locale.to_s)) ]
    end

    keys.each_value { |own| assert_equal keys.values.first, own }
  end

  private
    def flatten(tree, prefix = nil)
      tree.flat_map do |key, value|
        name = [ prefix, key ].compact.join(".")
        value.is_a?(Hash) ? flatten(value, name) : [ name ]
      end.sort
    end
end

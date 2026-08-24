require_relative "boot"

require "rails"

# Everything except Active Storage, Action Text and Action Mailbox, which this
# app has no use for. Action Cable is what Turbo Streams ride on.
require "active_model/railtie"
require "active_job/railtie"
require "active_record/railtie"
require "action_controller/railtie"
require "action_view/railtie"
require "action_cable/engine"

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(*Rails.groups)

module TimerbotRails
  class Application < Rails::Application
    config.load_defaults 8.1

    config.autoload_lib(ignore: %w[assets tasks])
  end
end

# Everything the pages load is same-origin; 'self' also covers the ActionCable
# websocket under connect-src. Two inline pieces carry the nonce: the layout's
# theme script, which must run before first paint, and the <style> Turbo
# injects for its progress bar, off csp_meta_tag.
Rails.application.configure do
  config.content_security_policy do |policy|
    policy.default_src :self
    # Named even though default_src covers them: the nonce only lands on
    # directives the policy names.
    policy.script_src :self
    policy.style_src  :self

    policy.object_src :none
    policy.base_uri   :self
    policy.form_action :self
    policy.frame_ancestors :self
  end

  # Random per request: nothing here is cacheable by a shared cache anyway.
  config.content_security_policy_nonce_generator = ->(_request) { SecureRandom.base64(16) }
  config.content_security_policy_nonce_directives = %w[script-src style-src]
end

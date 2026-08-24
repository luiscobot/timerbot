# One SVG for every environment: the ring is currentColor, so the color the
# root carries is the only thing an environment changes.
class FaviconsController < ApplicationController
  # The policy governs a document; this answer is an image. Its <style> holds
  # the mark's colors and can carry no nonce — the response is cached and a
  # nonce is minted per request — so a style-src that reached it would blank
  # the tab.
  content_security_policy false

  # The accent zinc where it is deployed, Iniciar's lime on a local server, so
  # a tab says which timer it is on. One ring either way, not one per scheme:
  # both read on either background, and the dot is the ink that still swaps.
  RING = { local: "#84cc16", deployed: "#71717a" }.freeze

  def show
    expires_in 1.day, public: true
    render :show, locals: { ring: RING[Rails.env.local? ? :local : :deployed] }
  end
end

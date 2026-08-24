require "test_helper"

class FaviconsControllerTest < ActionDispatch::IntegrationTest
  test "the icon is an SVG whose ring is the color the root carries" do
    get "/favicon.svg"

    assert_response :success
    assert_equal "image/svg+xml", response.media_type
    assert_includes response.body, "stroke: currentColor"
  end

  test "a local server rings the mark in lime" do
    get "/favicon.svg"

    assert_includes response.body, %(color="#84cc16")
  end

  test "a deployed one rings it in zinc" do
    original = Rails.env
    Rails.env = "production"

    get "/favicon.svg"

    assert_includes response.body, %(color="#71717a")
  ensure
    Rails.env = original
  end

  # Its <style> is the mark's colors, and it can carry no nonce.
  test "no policy reaches the icon" do
    get "/favicon.svg"

    assert_nil response.headers["Content-Security-Policy"]
  end
end

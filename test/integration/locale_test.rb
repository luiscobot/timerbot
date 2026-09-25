require "test_helper"

# The language is the browser's to choose, through Accept-Language alone.
# Spanish is the default; English is the one other language spoken.
class LocaleTest < ActionDispatch::IntegrationTest
  test "no header is Spanish" do
    get root_path

    assert_select "html[lang=es]"
    assert_select ".control.start[title=?]", "Iniciar (Espacio)"
    assert_select ".minutes .label", "minutos"
  end

  test "a browser asking for English is answered in it" do
    get root_path, headers: { "Accept-Language" => "en-US,en;q=0.9,es;q=0.8" }

    assert_select "html[lang=en]"
    assert_select "input[type=submit][name=start][value=?]", "Start"
    assert_select ".control.start[title=?]", "Start (Space)"
    assert_select "label.control.deadline[title=?]", "Until (H)"
    assert_select "label.control.deadline .caption", "Until"
    assert_select "label.control.deadline select[aria-label=?]", "Until"
    assert_select ".control.watch[title=?]", "Project (P)"
    assert_select ".control.watch[aria-label=?]", "Project"
    assert_select ".control.appearance[aria-label=?]", "Switch to light mode"
    assert_select ".control.appearance[data-appearance-dark-label-value=?]", "Switch to dark mode"
    assert_select ".minutes .label", "minutes"
    assert_select ".seconds .label", "seconds"
  end

  test "the dashboard speaks English too" do
    timer = timers(:one)

    get timer_path(timer), headers: { "Accept-Language" => "en" }

    assert_select "html[lang=en]"
    assert_select ".control.start", text: "Start"
    assert_select ".control.start[title=?]", "Start (Space)"
    assert_select ".control.reset[title=?]", "Reset (R)"
    assert_select ".control.watch[title=?]", "Project (P)"
  end

  test "a language the app does not speak falls back to Spanish" do
    get root_path, headers: { "Accept-Language" => "fr-FR,fr;q=0.9" }

    assert_select "html[lang=es]"
  end

  test "a wildcard is the default" do
    get root_path, headers: { "Accept-Language" => "*" }

    assert_select "html[lang=es]"
  end

  test "the weight decides, not the position" do
    get root_path, headers: { "Accept-Language" => "es;q=0.5, en" }

    assert_select "html[lang=en]"
  end

  test "a zero weight rules a language out" do
    get root_path, headers: { "Accept-Language" => "en;q=0, es" }

    assert_select "html[lang=es]"
  end

  test "case does not matter" do
    get root_path, headers: { "Accept-Language" => "EN-us" }

    assert_select "html[lang=en]"
  end

  test "every page says the header decided it" do
    get root_path, headers: { "Accept-Language" => "en" }
    assert_equal "Accept-Language", response.headers["Vary"]

    get watch_path(timers(:one).watch_slug)
    assert_equal "Accept-Language", response.headers["Vary"]
  end

  # The rate limit's refusal renders inside the same action wrapper.
  test "the limit is refused in the browser's language" do
    (TimersController::CREATION_LIMIT + 1).times do
      post timers_path, params: { duration: 125 }, headers: { "Accept-Language" => "en" }
    end

    assert_response :too_many_requests
    assert_select "html[lang=en]"
    assert_select ".error:not([hidden])", text: "Hold on a moment."
  end

  test "an hour is refused in the browser's language, on both halves" do
    post timers_path, params: { duration: 125, deadline: 1.minute.ago.utc.iso8601(3) },
                      headers: { "Accept-Language" => "en" }

    assert_response :unprocessable_entity
    assert_select ".error:not([hidden])", text: "That hour has passed."
    assert_select "main[data-duration-message-value=?]", "Give it at least a second."
    assert_select "main[data-duration-passed-message-value=?]", "That hour has passed."
    assert_select "main[data-duration-beyond-message-value=?]", "One hour at most."
  end
end

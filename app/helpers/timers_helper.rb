module TimersHelper
  # 754.2 -> ["12", "35"]
  def timer_digits(seconds)
    seconds.ceil.divmod(60).map { format("%02d", it) }
  end
end

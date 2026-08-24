class RenameProjectionSlugToWatchSlug < ActiveRecord::Migration[8.1]
  def change
    rename_column :timers, :projection_slug, :watch_slug
  end
end

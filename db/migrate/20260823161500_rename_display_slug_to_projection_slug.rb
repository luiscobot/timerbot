class RenameDisplaySlugToProjectionSlug < ActiveRecord::Migration[8.1]
  def change
    rename_column :timers, :display_slug, :projection_slug
  end
end

# Weekly kanban snapshot

A full-page visual snapshot of the newest weekly kanban record, opened from a **Weekly**
entry in the left sidebar beside **Kanban**. Use the **‹ / ›** buttons next to the week
key to move between the snapshots available in `weekly/`.

## What it shows

- The snapshot week and its inclusive date range, plus the generation time.
- This week's board total with status composition (idea / active / paused / done).
- Finished, new, archived and touched counts.
- The completed projects with their group and last-edit date.
- A compact bar chart of finished / new / archived / touched, with the previous week
  beside the current one.

## Data source

The host half reads the newest `weekly/YYYY-Www.md` snapshot in the workspace
(`workspace` in `cordis.patch.yml`, falling back to a registered DSH workspace that
contains a `weekly/` directory). It parses the snapshot's "At a glance", "Finished"
and "In progress" sections, reads the previous week's file for deltas, and looks up a
finished project's group in the earlier snapshots where it was in progress. Nothing is
written.

If the newest snapshot is missing or unreadable, the page keeps the last snapshot it
had and says so; **Refresh** retries. The page reloads the newest file whenever it is
opened, when the window becomes active again, and on **Refresh**, so the following
Monday's scheduled snapshot appears without a restart.

## Limitations

- Groups are only available for projects that appear in an "In progress" section of a
  weekly snapshot; a project finished in its first recorded week has no group to show.
- The page reads only `weekly/*.md`; it never reads the kanban board or the archive.
- It does not poll: a newly written snapshot appears on the next open or **Refresh**.

## Uninstall

Remove the bundle (`plugin_manager remove_bundle` or the Plugins page). The sidebar entry
and page disappear; the weekly files are untouched.

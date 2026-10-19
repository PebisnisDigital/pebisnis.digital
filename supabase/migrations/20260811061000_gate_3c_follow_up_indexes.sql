create index if not exists follow_up_automations_created_by_idx
  on public.follow_up_automations(created_by);

create index if not exists follow_up_enrollments_source_idx
  on public.follow_up_enrollments(source_id);

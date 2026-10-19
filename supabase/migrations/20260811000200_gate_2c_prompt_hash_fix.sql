create extension if not exists pgcrypto with schema extensions;

create or replace function private.prepare_prompt_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.content_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(new.parts::text, 'UTF8'), 'sha256'),
    'hex'
  );

  if tg_op = 'UPDATE' and old.status in ('APPROVED', 'RETIRED') then
    if new.parts is distinct from old.parts
      or new.license_type is distinct from old.license_type
      or new.creator_name is distinct from old.creator_name
      or new.source_url is distinct from old.source_url
      or new.permission_reference is distinct from old.permission_reference
      or new.preview_allowed is distinct from old.preview_allowed
      or new.prompt_id is distinct from old.prompt_id
      or new.version_no is distinct from old.version_no
      or (old.status = 'RETIRED' and new.status <> 'RETIRED')
      or (old.status = 'APPROVED' and new.status not in ('APPROVED', 'RETIRED')) then
      raise exception 'Approved prompt versions are immutable; create a new version';
    end if;
  end if;

  return new;
end;
$function$;


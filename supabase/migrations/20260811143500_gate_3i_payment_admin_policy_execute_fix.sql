-- Gate 3I hotfix: RLS policies call this private helper as the authenticated
-- request role. The role needs EXECUTE permission for policy evaluation.
-- The helper only returns whether the current auth.uid() is an active payment
-- admin and remains unavailable to anonymous requests.

revoke all on function private.can_manage_payments() from public, anon;
grant execute on function private.can_manage_payments() to authenticated;

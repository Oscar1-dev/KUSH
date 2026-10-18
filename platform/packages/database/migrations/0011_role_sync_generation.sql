-- A sync request that arrives while its job is being processed is
-- coalesced into that job. Without a generation, the worker then marked the
-- job done and the new request was lost (found in live testing: an unlink
-- arriving mid-run left the member's product roles in place).
-- Each coalesce bumps the generation; a worker may only complete the
-- generation it read, so anything newer stays pending and runs again.
ALTER TABLE role_sync_jobs ADD COLUMN generation integer NOT NULL DEFAULT 0;

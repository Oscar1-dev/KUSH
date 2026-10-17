-- A Discord account may be linked to only one KUSH account at a time, but
-- revoked links are kept for audit. The original constraint also counted
-- revoked rows, so a Discord account could never be linked again after an
-- unlink (found in live testing, 17 October 2026).
ALTER TABLE discord_account_links DROP CONSTRAINT discord_account_links_tenant_id_discord_user_id_key;
CREATE UNIQUE INDEX discord_account_links_verified_discord_idx
  ON discord_account_links(tenant_id, discord_user_id)
  WHERE state = 'verified';

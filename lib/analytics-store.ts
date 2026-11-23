import type {
  AnalyticsConsent,
  AnalyticsEvent,
  ParticipantCode,
} from "./analytics-schema.ts";
import type { Query } from "./storage.ts";
import { RETENTION_MS } from "./retention.ts";
export class AnalyticsConsentDeleted extends Error {}
export interface AnalyticsStorage {
  getAnalyticsConsent(owner: string): Promise<AnalyticsConsent>;
  setAnalyticsConsent(
    owner: string,
    enabled: boolean,
    participantCode: ParticipantCode,
  ): Promise<AnalyticsConsent>;
  appendAnalyticsEvents(
    owner: string,
    token: string,
    events: AnalyticsEvent[],
  ): Promise<number>;
  eraseAnalytics(owner: string): Promise<void>;
  cleanupAnalytics(): Promise<{
    events: number;
    preferences: number;
    analyticsUsage: number;
  }>;
}
export function createAnalyticsStorage(
  query: Query,
  now = Date.now,
): AnalyticsStorage {
  return {
    async getAnalyticsConsent(owner) {
      const [p] = await query(
        "SELECT enabled,deleted,epoch,participant_code,updated_at FROM analytics_preferences WHERE owner_key=$1",
        [owner],
      );
      const enabled =
        !!p &&
        Number(p.enabled) === 1 &&
        Number(p.deleted) === 0 &&
        Number(p.updated_at) > now() - RETENTION_MS;
      return {
        enabled,
        token: enabled ? String(p.epoch) : null,
        participantCode: enabled
          ? (p.participant_code as ParticipantCode)
          : null,
      };
    },
    async setAnalyticsConsent(owner, enabled, participantCode) {
      const epoch = crypto.randomUUID();
      const rows = await query(
        "INSERT INTO analytics_preferences(owner_key,enabled,deleted,epoch,participant_code,updated_at) VALUES($1,$2,0,$3,$4,$5) ON CONFLICT(owner_key) DO UPDATE SET enabled=excluded.enabled,epoch=excluded.epoch,participant_code=excluded.participant_code,updated_at=excluded.updated_at WHERE analytics_preferences.deleted=0 RETURNING epoch",
        [
          owner,
          Number(enabled),
          epoch,
          enabled ? participantCode : null,
          now(),
        ],
      );
      if (!rows.length) throw new AnalyticsConsentDeleted();
      // Changing a cohort or renewing consent starts a fresh measurement period.
      await query(
        "DELETE FROM lab_events WHERE owner_key=$1 AND consent_epoch <> $2",
        [owner, epoch],
      );
      return {
        enabled,
        token: enabled ? epoch : null,
        participantCode: enabled ? participantCode : null,
      };
    },
    async appendAnalyticsEvents(owner, token, events) {
      const day = new Date(now()).toISOString().slice(0, 10);
      const reserve = async (key: string, limit: number) =>
        (
          await query(
            "INSERT INTO analytics_usage(key,count) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET count=analytics_usage.count+excluded.count WHERE analytics_usage.count+excluded.count <= $3 RETURNING count",
            [day + ":" + key, events.length, limit],
          )
        ).length > 0;
      const consent = await this.getAnalyticsConsent(owner);
      if (!consent.enabled || consent.token !== token) return 0;
      if (!(await reserve(owner, 500)) || !(await reserve("global", 10000)))
        return 0;
      let accepted = 0;
      for (const event of events) {
        const rows = await query(
          "INSERT INTO lab_events(id,owner_key,participant_code,consent_epoch,event_json,created_at) SELECT $1,$2,consent.participant_code,$3,$4,$5 FROM (SELECT owner_key,participant_code FROM analytics_preferences WHERE owner_key=$6 AND enabled=1 AND deleted=0 AND epoch=$7 AND updated_at > $8 FOR UPDATE) AS consent WHERE 1=1 ON CONFLICT(id) DO NOTHING RETURNING id",
          [
            event.id,
            owner,
            token,
            JSON.stringify(event),
            now(),
            owner,
            token,
            now() - RETENTION_MS,
          ],
        );
        accepted += rows.length;
      }
      return accepted;
    },
    async eraseAnalytics(owner) {
      await query(
        "INSERT INTO analytics_preferences(owner_key,enabled,deleted,epoch,participant_code,updated_at) VALUES($1,0,1,$2,NULL,$3) ON CONFLICT(owner_key) DO UPDATE SET enabled=0,deleted=1,epoch=excluded.epoch,participant_code=NULL,updated_at=excluded.updated_at",
        [owner, crypto.randomUUID(), now()],
      );
      await query("DELETE FROM lab_events WHERE owner_key=$1", [owner]);
    },
    async cleanupAnalytics() {
      const events = await query(
        "DELETE FROM lab_events WHERE created_at <= $1 RETURNING id",
        [now() - RETENTION_MS],
      );
      const preferences = await query(
        "DELETE FROM analytics_preferences WHERE updated_at <= $1 RETURNING owner_key",
        [now() - RETENTION_MS],
      );
      const usage = await query(
        "DELETE FROM analytics_usage WHERE key < $1 RETURNING key",
        [new Date(now()).toISOString().slice(0, 10) + ":"],
      );
      return {
        events: events.length,
        preferences: preferences.length,
        analyticsUsage: usage.length,
      };
    },
  };
}

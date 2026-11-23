import { consentSchema, eventBatchSchema } from "./analytics-schema.ts";
import { AnalyticsConsentDeleted } from "./analytics-store.ts";
import type { LabStorage } from "./storage.ts";
import { identity, json, readBody, sameOrigin } from "./server.ts";
export async function analyticsRequest(
  req: Request,
  storage: () => Promise<LabStorage>,
) {
  const id = identity(req);
  if (req.method !== "GET" && !sameOrigin(req))
    return json({ error: "같은 페이지에서 다시 시도해주세요." }, 403);
  try {
    if (req.method === "GET")
      return json(
        await (await storage()).getAnalyticsConsent(id.key),
        200,
        id.cookie ? { "Set-Cookie": id.cookie } : {},
      );
    if (req.method === "PUT" || req.method === "DELETE") {
      let choice;
      try {
        choice =
          req.method === "DELETE"
            ? { enabled: false, participantCode: null }
            : consentSchema.parse(await readBody(req, 2000));
      } catch {
        return json({ error: "참여 설정을 확인해주세요." }, 400);
      }
      return json(
        await (
          await storage()
        ).setAnalyticsConsent(id.key, choice.enabled, choice.participantCode),
        200,
        id.cookie ? { "Set-Cookie": id.cookie } : {},
      );
    }
    if (req.method === "POST") {
      let batch;
      try {
        batch = eventBatchSchema.parse(await readBody(req, 16000));
      } catch {
        return json({ error: "허용된 활동 요약만 보낼 수 있어요." }, 400);
      }
      const store = await storage(),
        consent = await store.getAnalyticsConsent(id.key);
      if (!consent.enabled || consent.token !== batch.token)
        return json({ error: "활동 기록 참여가 꺼져 있어요." }, 403);
      return json({
        accepted: await store.appendAnalyticsEvents(
          id.key,
          batch.token,
          batch.events,
        ),
      });
    }
    return json({ error: "Method not allowed" }, 405);
  } catch (error) {
    if (error instanceof AnalyticsConsentDeleted)
      return json({ error: "삭제된 세션이에요. 새로고침해주세요." }, 409);
    return json(
      { error: "활동 기록에 연결하지 못했어요. 체험은 계속할 수 있어요." },
      503,
    );
  }
}

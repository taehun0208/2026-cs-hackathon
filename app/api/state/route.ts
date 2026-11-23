import { keepsStartedVersions } from "../../../lib/lab-state";
import { storageDates } from "../../../lib/retention";
import { RecordConflict, RecordDeleted } from "../../../lib/storage";
import {
  getStorage,
  identity,
  json,
  readBody,
  sameOrigin,
  stateSchema,
} from "../../../lib/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const id = identity(req);
  try {
    const store = await getStorage();
    const saved = await store.read(id.key);
    return json(
      {
        state: saved ? stateSchema.parse(saved.state) : null,
        ...(saved
          ? storageDates(saved.updatedAt)
          : { savedAt: null, expiresAt: null }),
      },
      200,
      id.cookie ? { "Set-Cookie": id.cookie } : {},
    );
  } catch {
    return json(
      {
        error: "저장소에 연결하지 못했어요. 이 기기에 초안을 보관하고 있어요.",
      },
      503,
      id.cookie ? { "Set-Cookie": id.cookie } : {},
    );
  }
}
export async function POST(req: Request) {
  if (!sameOrigin(req))
    return json({ error: "같은 페이지에서 다시 시도해주세요." }, 403);
  const id = identity(req, false, true);
  let state;
  try {
    state = stateSchema.parse(await readBody(req));
  } catch {
    return json({ error: "저장할 내용의 형식이나 길이를 확인해주세요." }, 400);
  }
  try {
    const store = await getStorage();
    const previous = await store.read(id.key);
    const revision = req.headers.get("X-Lab-Revision");
    const expected =
      !revision || revision === "new" ? null : Date.parse(revision);
    if (expected !== null && !Number.isSafeInteger(expected))
      return json(
        { error: "저장 기준을 확인하지 못했어요. 새로고침해주세요." },
        400,
      );
    if (!previous && expected !== null)
      throw new RecordDeleted("RECORD_DELETED");
    if ((previous?.updatedAt ?? null) !== expected)
      throw new RecordConflict("RECORD_CONFLICT");
    if (!keepsStartedVersions(previous?.state ?? null, state))
      return json(
        {
          error:
            "시작한 과제 기준이 달라 저장하지 않았어요. 기기 초안을 내려받고 새로고침해주세요.",
        },
        409,
      );
    const timestamp = await store.save(id.key, state, expected);
    return json(
      storageDates(timestamp),
      200,
      id.cookie ? { "Set-Cookie": id.cookie } : {},
    );
  } catch (error) {
    if (error instanceof RecordConflict) {
      try {
        const latest = await (await getStorage()).read(id.key);
        return json(
          {
            code: "RECORD_CONFLICT",
            error: "다른 탭에서 기록을 변경했어요. 변경 내용을 확인해주세요.",
            state: latest ? stateSchema.parse(latest.state) : null,
            ...(latest
              ? storageDates(latest.updatedAt)
              : { savedAt: null, expiresAt: null }),
          },
          409,
        );
      } catch {
        return json(
          { error: "최신 기록을 확인하지 못했어요. 다시 시도해주세요." },
          503,
        );
      }
    }
    if (error instanceof RecordDeleted)
      return json(
        {
          code: "RECORD_DELETED",
          error:
            "삭제된 기록에는 다시 저장할 수 없어요. 새로고침해 새 체험을 시작해주세요.",
        },
        409,
      );
    return json(
      { error: "저장하지 못했어요. 연결 후 다시 시도해주세요." },
      503,
    );
  }
}
export async function DELETE(req: Request) {
  if (!sameOrigin(req))
    return json({ error: "같은 페이지에서 다시 시도해주세요." }, 403);
  try {
    await (await getStorage()).remove(identity(req).key);
    return json({ deleted: true }, 200, {
      "Set-Cookie": identity(req, true).cookie,
    });
  } catch {
    return json(
      { error: "기록을 삭제하지 못했어요. 연결 후 다시 시도해주세요." },
      503,
    );
  }
}

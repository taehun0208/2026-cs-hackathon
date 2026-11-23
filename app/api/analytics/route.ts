import { analyticsRequest } from "../../../lib/analytics-handler";
import { getStorage } from "../../../lib/storage";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handle = (request: Request) => analyticsRequest(request, getStorage);
export { handle as GET, handle as POST, handle as PUT, handle as DELETE };

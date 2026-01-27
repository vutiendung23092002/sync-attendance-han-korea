import pLimit from "p-limit";

import { createLarkClient } from "./src/core/larkbase-client.js";
import { supabase } from "./src/core/supabase-client.js";
import { decrypt } from "./src/utils/common/AES-256-CBC.js";
import {
  getListInstances,
  getdetailsInstance,
} from "./src/services/larkbase/attendance.js";
import {
  getTodayYmd,
  vnTimeToUTCTimestampMiliseconds,
  writeJsonFile,
} from "./src/utils/index.js";
import { env } from "./src/config/env.js";
import { formatLeaveInstances } from "./src/utils/larkbase/instance_leave_formarted.js";
import {
  LEAVE_FIELD_MAP,
  LEAVE_TYPE_MAP,
  LEAVE_UI_TYPE_MAP,
} from "./src/utils/index.js";
import { syncDataToLarkBaseFilterDate } from "./src/services/larkbase/sync-to-lark.js";

/**
 * ==========================
 * CONCURRENCY CONFIG
 * ==========================
 */
const DEPARTMENT_CONCURRENCY = 5; // số phòng ban song song
const DETAIL_CONCURRENCY = 5;     // số detail request song song / phòng ban

const limitDepartment = pLimit(DEPARTMENT_CONCURRENCY);
const limitDetail = pLimit(DETAIL_CONCURRENCY);

async function listLeaveInstances(
  hrmAppId,
  hrmAppSecret,
  baseID,
  tableName,
  from,
  to
) {
  console.log("=== BẮT ĐẦU SYNC LEAVE INSTANCES ===");
  console.log(from + "-" + to)

  // 1️⃣ Lấy danh sách phòng ban
  const { data: client_attendance, error } = await supabase
    .from("client-attendance-hankor")
    .select()
    .eq("status", true);

  if (error) {
    console.error("❌ LỖI LẤY PHÒNG BAN:", error);
    return;
  }

  if (!client_attendance?.length) {
    console.log("ℹ️ Không có phòng ban nào cần sync.");
    return;
  }

  console.log(`>>> TỔNG PHÒNG BAN: ${client_attendance.length}`);

  // 2️⃣ HRM client (dùng chung)
  const clientHrm = await createLarkClient(hrmAppId, hrmAppSecret);

  /**
   * 3️⃣ FETCH SONG SONG PHÒNG BAN (CÓ GIỚI HẠN)
   */
  const departmentResults = await Promise.allSettled(
    client_attendance.map((c) =>
      limitDepartment(async () => {
        if (!c.approval_code_leave) {
          console.warn(
            `⚠️ ${c.ten_phong_ban.trim()} không có approval_code_leave`
          );
          return [];
        }

        console.log(`>>> FETCH LEAVE: ${c.ten_phong_ban.trim()}`);

        const app_id = decrypt(c.lark_app_id);
        const app_secret = decrypt(c.lark_app_secret);
        const clientAtt = await createLarkClient(app_id, app_secret);

        // 3.1 Lấy danh sách instance
        const instances = await getListInstances(
          clientAtt,
          vnTimeToUTCTimestampMiliseconds(from),
          vnTimeToUTCTimestampMiliseconds(to),
          c.approval_code_leave
        );

        if (!instances.length) return [];

        console.log(
          `>>> ${c.ten_phong_ban.trim()} - leave instances: ${instances.length}`
        );

        const minimal = instances.map((x) => ({
          user_id: x.instance.user_id,
          instance_code: x.instance.code,
        }));

        /**
         * 3.2 FETCH DETAILS (CÓ THROTTLE)
         */
        const detailResults = await Promise.allSettled(
          minimal.map((item) =>
            limitDetail(() =>
              getdetailsInstance(
                clientAtt,
                item.instance_code,
                item.user_id
              )
            )
          )
        );

        return detailResults
          .filter((r) => r.status === "fulfilled")
          .map((r) => ({
            ...r.value?.data,
            department_name: c.ten_phong_ban.trim(),
          }));
      })
    )
  );

  /**
   * 4️⃣ GỘP DATA
   */
  const detailsInstanceAll = departmentResults
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);

  console.log(
    `>>> TỔNG RECORD LEAVE LẤY ĐƯỢC: ${detailsInstanceAll.length}`
  );

  if (!detailsInstanceAll.length) {
    console.warn("⚠️ Không có dữ liệu leave để sync.");
    return;
  }

  /**
   * 5️⃣ FORMAT DATA
   */
  const instanceFormatted = formatLeaveInstances(detailsInstanceAll);

  writeJsonFile("./logs/instanceF.json", instanceFormatted);
  writeJsonFile("./logs/instanceD.json", detailsInstanceAll)

  /**
   * 6️⃣ SYNC LARKBASE (1 LẦN DUY NHẤT)
   */
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const timestampFrom =
    vnTimeToUTCTimestampMiliseconds(from) - ONE_DAY;
  const timestampTo =
    vnTimeToUTCTimestampMiliseconds(to) + ONE_DAY;

  console.log(">>> SYNC LEAVE LÊN LARKBASE…");

  await syncDataToLarkBaseFilterDate(
    clientHrm,
    baseID,
    {
      tableName,
      records: instanceFormatted,
      fieldMap: LEAVE_FIELD_MAP,
      typeMap: LEAVE_TYPE_MAP,
      uiType: LEAVE_UI_TYPE_MAP,
      currencyCode: "VND",
      idLabel: "Id",
      excludeUpdateField: [],
    },
    "Submitted at",
    timestampFrom,
    timestampTo
  );

  console.log("✅ HOÀN TẤT SYNC LEAVE INSTANCES");
}

/**
 * ==========================
 * ENTRY
 * ==========================
 */
const hrmAppId = env.LARK.hrm_app.app_id;
const hrmAppSecret = env.LARK.hrm_app.app_secret;
const baseID = env.LARK.BASE_ID;

const tableName = process.env.TABLE_INSTANCES_NAME;

const from = process.env.FROM
  ? `${process.env.FROM} 00:00:00`
  : `${getTodayYmd(29)} 00:00:00`;

const to = process.env.TO
  ? `${process.env.TO} 23:59:59`
  : `${getTodayYmd(0)} 23:59:59`;

listLeaveInstances(
  hrmAppId,
  hrmAppSecret,
  baseID,
  tableName,
  from,
  to
).catch((err) => {
  console.error("🔥 LỖI TOÀN CỤC:", err);
  process.exit(1);
});

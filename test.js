import pLimit from "p-limit";

import { createLarkClient } from "./src/core/larkbase-client.js";
import { supabase } from "./src/core/supabase-client.js";
import { decrypt } from "./src/utils/common/AES-256-CBC.js";
import {
  getListInstances,
  getdetailsInstance,
} from "./src/services/larkbase/attendance.js";
import {
  CORECTION_RECORD_FIELD_MAP,
  CORECTION_RECORD_TYPE_MAP,
  CORECTION_RECORD_UI_TYPE_MAP,
  vnTimeToUTCTimestampMiliseconds,
  writeJsonFile,
  getTodayYmd,
} from "./src/utils/index.js";
import { env } from "./src/config/env.js";
import { formatCorrectionRecordsV2 } from "./src/utils/larkbase/corection-records-formated.js";
import { syncDataToLarkBaseFilterDate } from "./src/services/larkbase/sync-to-lark.js";

/**
 * ==========================
 * CONCURRENCY CONFIG
 * ==========================
 */
const DEPARTMENT_CONCURRENCY = 3; // số phòng ban chạy song song
const DETAIL_CONCURRENCY = 5;     // số detail request song song / phòng ban

const limitDepartment = pLimit(DEPARTMENT_CONCURRENCY);
const limitDetail = pLimit(DETAIL_CONCURRENCY);

/**
 * ==========================
 * MAIN LOGIC
 * ==========================
 */
async function listCorrectionInstances(
  hrmAppId,
  hrmAppSecret,
  baseID,
  tableName,
  from,
  to
) {
  console.log("=== BẮT ĐẦU SYNC CORRECTION (SAFE MODE) ===");

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
        if (!c.approval_code_correction) {
          console.warn(
            `⚠️ ${c.ten_phong_ban.trim()} không có approval_code_correction`
          );
          return [];
        }

        console.log(`>>> FETCH CORRECTION: ${c.ten_phong_ban.trim()}`);

        const app_id = decrypt(c.lark_app_id);
        const app_secret = decrypt(c.lark_app_secret);
        const clientAtt = await createLarkClient(app_id, app_secret);

        // 3.1 Lấy danh sách instance
        const instances = await getListInstances(
          clientAtt,
          vnTimeToUTCTimestampMiliseconds(from),
          vnTimeToUTCTimestampMiliseconds(to),
          c.approval_code_correction
        );

        if (!instances.length) return [];

        console.log(
          `>>> ${c.ten_phong_ban.trim()} - instances: ${instances.length}`
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
  const detailsCorrectionAll = departmentResults
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);

  console.log(
    `>>> TỔNG RECORD CORRECTION LẤY ĐƯỢC: ${detailsCorrectionAll.length}`
  );

  if (!detailsCorrectionAll.length) {
    console.warn("⚠️ Không có dữ liệu correction để sync.");
    return;
  }

  // debug
  writeJsonFile("./logs/correctionV2.json", detailsCorrectionAll);

  /**
   * 5️⃣ FORMAT DATA
   */
  const correctionFormatted =
    formatCorrectionRecordsV2(detailsCorrectionAll);

  writeJsonFile(
    "./logs/correctionV2-Formatted.json",
    correctionFormatted
  );

  /**
   * 6️⃣ SYNC LARKBASE (1 LẦN DUY NHẤT)
   */
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const timestampFrom =
    vnTimeToUTCTimestampMiliseconds(from) - ONE_DAY;
  const timestampTo =
    vnTimeToUTCTimestampMiliseconds(to) + ONE_DAY;

  console.log(">>> SYNC LARKBASE…");

  await syncDataToLarkBaseFilterDate(
    clientHrm,
    baseID,
    {
      tableName,
      records: correctionFormatted,
      fieldMap: CORECTION_RECORD_FIELD_MAP,
      typeMap: CORECTION_RECORD_TYPE_MAP,
      uiType: CORECTION_RECORD_UI_TYPE_MAP,
      currencyCode: "VND",
      idLabel: "Id",
      excludeUpdateField: [],
    },
    "Submitted at",
    timestampFrom,
    timestampTo
  );

  console.log("✅ HOÀN TẤT SYNC CORRECTION");
}

/**
 * ==========================
 * ENTRY POINT
 * ==========================
 */
const hrmAppId = env.LARK.hrm_app.app_id;
const hrmAppSecret = env.LARK.hrm_app.app_secret;
const baseID = env.LARK.BASE_ID;

const tableName = process.env.TABLE_CORECTION_NAME;

const from = process.env.FROM
  ? `${process.env.FROM} 00:00:00`
  : `${getTodayYmd(29)} 00:00:00`;

const to = process.env.TO
  ? `${process.env.TO} 23:59:59`
  : `${getTodayYmd(0)} 23:59:59`;

listCorrectionInstances(
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

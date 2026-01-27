import { fetchAttendanceForDepartment } from "./src/services/larkbase/attendance.js";
import { createLarkClient } from "./src/core/larkbase-client.js";
import { getTodayYmd } from "./src/utils/common/time-helper.js";
import { decrypt } from "./src/utils/common/AES-256-CBC.js";
import { env } from "./src/config/env.js";
import { supabase } from "./src/core/supabase-client.js";
import { vnTimeToUTCTimestampMiliseconds } from "./src/utils/index.js";
import { syncDataToLarkBaseFilterDate } from "./src/services/larkbase/sync-to-lark.js";
import {
  ATTENDANCE_FIELD_MAP,
  ATTENDANCE_TYPE_MAP,
  ATTENDANCE_UI_TYPE_MAP,
} from "./src/utils/larkbase/field-maps.js";

async function syncAttendance(
  hrmAppId,
  hrmAppSecret,
  baseID,
  tableName,
  from,
  to,
) {
  console.log("=== BẮT ĐẦU SYNC TOÀN BỘ PHÒNG BAN ===");

  // 1️⃣ Lấy danh sách phòng ban cần sync
  const { data: client_attendance, error } = await supabase
    .from("client-attendance-hankor")
    .select()
    .eq("status", true);

  if (error) {
    console.error("❌ LỖI LẤY DANH SÁCH PHÒNG BAN:", error);
    return;
  }

  if (!client_attendance?.length) {
    console.log("ℹ️ Không có phòng ban nào cần sync.");
    return;
  }

  console.log(`>>> TỔNG PHÒNG BAN: ${client_attendance.length}`);

  // 2️⃣ Tạo HRM client (dùng chung)
  const clientHrm = await createLarkClient(hrmAppId, hrmAppSecret);

  // 3️⃣ FETCH SONG SONG TẤT CẢ PHÒNG BAN
  console.log(">>> BẮT ĐẦU FETCH SONG SONG TẤT CẢ PHÒNG BAN");

  const results = await Promise.allSettled(
    client_attendance.map(async (c) => {
      console.log(`>>> FETCH PHÒNG BAN: ${c.ten_phong_ban.trim()}`);

      const app_id = decrypt(c.lark_app_id);
      const app_secret = decrypt(c.lark_app_secret);

      const clientAtt = await createLarkClient(app_id, app_secret);

      return fetchAttendanceForDepartment(
        clientAtt,
        c.id_phongban,
        c.ten_phong_ban,
        from,
        to,
      );
    }),
  );

  // 4️⃣ GỘP DATA SAU KHI TẤT CẢ XONG
  const allAttendance = results
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);

  const failedDepartments = results.filter((r) => r.status === "rejected");

  console.log(
    `>>> PHÒNG BAN THÀNH CÔNG: ${results.length - failedDepartments.length}`,
  );
  console.log(`>>> PHÒNG BAN THẤT BẠI: ${failedDepartments.length}`);
  console.log(`>>> TỔNG RECORD LẤY ĐƯỢC: ${allAttendance.length}`);

  if (!allAttendance.length) {
    console.warn("⚠️ Không có dữ liệu attendance để sync.");
    return;
  }

  // 5️⃣ SYNC LÊN LARKBASE 1 LẦN DUY NHẤT
  console.log(">>> BẮT ĐẦU SYNC LÊN LARKBASE (1 LẦN)");

  const ONE_DAY = 24 * 60 * 60 * 1000;
  const timestampFrom =
    vnTimeToUTCTimestampMiliseconds(`${from} 00:00:00`) - ONE_DAY;
  const timestampTo =
    vnTimeToUTCTimestampMiliseconds(`${to} 23:59:59`) + ONE_DAY;

  await syncDataToLarkBaseFilterDate(
    clientHrm,
    baseID,
    {
      tableName,
      records: allAttendance,
      fieldMap: ATTENDANCE_FIELD_MAP,
      typeMap: ATTENDANCE_TYPE_MAP,
      uiType: ATTENDANCE_UI_TYPE_MAP,
      currencyCode: "VND",
      idLabel: "Id",
      excludeUpdateField: [
        "Check in time(TH)",
        "Check out time(TH)",
        "Check in result(TH)",
        "Check out result(TH)",
        "Số phút đi muộn",
        "Sau 10p",
        "Trước 10p",
        "Số phút về sớm",
      ],
    },
    "Date(TH)",
    timestampFrom,
    timestampTo,
  );

  console.log("✅ HOÀN TẤT SYNC TẤT CẢ PHÒNG BAN");
}

// ==========================
// ENTRY POINT
// ==========================
const hrmAppId = env.LARK.hrm_app.app_id;
const hrmAppSecret = env.LARK.hrm_app.app_secret;

const baseID = env.LARK.BASE_ID;
const tableName = process.env.TABLE_NAME_ATTENDANCE;

const from = process.env.FROM || getTodayYmd(30);
const to = process.env.TO || getTodayYmd(0);

syncAttendance(hrmAppId, hrmAppSecret, baseID, tableName, from, to).catch(
  (err) => {
    console.error("🔥 LỖI TOÀN CỤC:", err);
    process.exit(1);
  },
);

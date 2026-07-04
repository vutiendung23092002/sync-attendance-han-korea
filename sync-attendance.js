import { fetchAttendanceForDepartment } from "./src/services/larkbase/attendance.js";
import { createLarkClient } from "./src/core/larkbase-client.js";
import { getTodayYmd } from "./src/utils/common/time-helper.js";
import { env } from "./src/config/env.js";
import { closePostgresPool } from "./src/core/postgres-client.js";
import { getAttendanceDepartmentConfigs } from "./src/services/hrm/department-configs.js";
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
  to
) {
  console.log("=== START SYNC ATTENDANCE ===");

  const departmentConfigs = await getAttendanceDepartmentConfigs();

  if (!departmentConfigs?.length) {
    console.log("No departments need syncing.");
    return;
  }

  console.log(`>>> TOTAL DEPARTMENTS: ${departmentConfigs.length}`);

  const clientHrm = await createLarkClient(hrmAppId, hrmAppSecret);

  console.log(">>> FETCH ALL DEPARTMENTS");

  const results = await Promise.allSettled(
    departmentConfigs.map(async (department) => {
      const departmentName =
        department.ten_phong_ban?.trim() || department.id_phongban;

      console.log(`>>> FETCH DEPARTMENT: ${departmentName}`);

      const clientAtt = await createLarkClient(
        department.lark_app_id,
        department.lark_app_secret
      );

      return fetchAttendanceForDepartment(
        clientAtt,
        department.id_phongban,
        departmentName,
        from,
        to
      );
    })
  );

  const allAttendance = results
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);

  const failedDepartments = results.filter((r) => r.status === "rejected");

  console.log(
    `>>> SUCCESS DEPARTMENTS: ${results.length - failedDepartments.length}`
  );
  console.log(`>>> FAILED DEPARTMENTS: ${failedDepartments.length}`);
  console.log(`>>> TOTAL ATTENDANCE RECORDS: ${allAttendance.length}`);

  if (!allAttendance.length) {
    console.warn("No attendance data to sync.");
    return;
  }

  console.log(">>> SYNC LARKBASE");

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
    timestampTo
  );

  console.log("DONE SYNC ATTENDANCE");
}

const hrmAppId = env.LARK.hrm_app.app_id;
const hrmAppSecret = env.LARK.hrm_app.app_secret;

const baseID = env.LARK.BASE_ID;
const tableName = process.env.TABLE_NAME_ATTENDANCE;

const from = process.env.FROM || getTodayYmd(30);
const to = process.env.TO || getTodayYmd(1);

syncAttendance(hrmAppId, hrmAppSecret, baseID, tableName, from, to)
  .catch((err) => {
    console.error("GLOBAL ERROR:", err);
    process.exitCode = 1;
  })
  .finally(() => closePostgresPool());

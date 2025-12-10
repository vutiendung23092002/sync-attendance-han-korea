import {
  searchLarkRecordsFilterDate,
  updateLarkRecords,
} from "./src/services/larkbase/index.js";

import { createLarkClient } from "./src/core/larkbase-client.js";
import {
  getTodayYmd,
  vnTimeToUTCTimestampMiliseconds,
} from "./src/utils/common/time-helper.js";
import { env } from "./src/config/env.js";
import { writeJsonFile } from "./src/utils/index.js";

async function checkCorrectionStatus(
  hrmAppId,
  hrmAppSecret,
  baseID,
  tableAttendanceId,
  tableCorectionRecordsId,
  from,
  to
) {
  console.log("=== BẮT ĐẦU CHECK TÌNH TRẠNG SỬA GIỜ ===");
  const ONE_DAY = 24 * 60 * 60 * 1000; // ms
  const timestampFrom = vnTimeToUTCTimestampMiliseconds(from) - ONE_DAY;
  const timestampTo = vnTimeToUTCTimestampMiliseconds(to) + ONE_DAY;
  // 1) Tạo Lark client HRM
  const clientHrm = await createLarkClient(hrmAppId, hrmAppSecret);

  // 2) Lấy danh sách bản ghi chấm công trong khoảng from - to
  const attendanceRecords = await searchLarkRecordsFilterDate(
    clientHrm,
    baseID,
    tableAttendanceId,
    1000,
    "Date(TH)",
    timestampFrom,
    timestampTo
  );

  writeJsonFile(`./src/data/attendance-records.json`, attendanceRecords);

  // 3) Lấy danh sách bản ghi sửa giờ trong khoảng from - to
  const correctionRecords = await searchLarkRecordsFilterDate(
    clientHrm,
    baseID,
    tableCorectionRecordsId,
    1000,
    "Date of error",
    timestampFrom,
    timestampTo
  );

  writeJsonFile(`./src/data/correction-records.json`, correctionRecords);
}

const hrmAppId = env.LARK.hrm_app.app_id;
const hrmAppSecret = env.LARK.hrm_app.app_secret;
const baseID = env.LARK.BASE_ID;
const tableAttendanceId = process.env.TABLE_ATTENDANCE_ID;
const tableCorectionRecordsId = process.env.TABLE_CORECTION_ID;
const from = process.env.FROM
  ? `${process.env.FROM} 00:00:00`
  : `${getTodayYmd(30)} 00:00:00`;
const to = process.env.TO
  ? `${process.env.TO} 23:59:59`
  : `${getTodayYmd(0)} 23:59:59`;

checkCorrectionStatus(
  hrmAppId,
  hrmAppSecret,
  baseID,
  tableAttendanceId,
  tableCorectionRecordsId,
  from,
  to
);

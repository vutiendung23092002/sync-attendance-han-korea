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

  const ONE_DAY = 24 * 60 * 60 * 1000;
  const timestampFrom = vnTimeToUTCTimestampMiliseconds(from) - ONE_DAY;
  const timestampTo = vnTimeToUTCTimestampMiliseconds(to) + ONE_DAY;

  const clientHrm = await createLarkClient(hrmAppId, hrmAppSecret);

  // 1) Lấy attendance
  const attendanceRecords = await searchLarkRecordsFilterDate(
    clientHrm,
    baseID,
    tableAttendanceId,
    1000,
    "Date(TH)",
    timestampFrom,
    timestampTo
  );
  writeJsonFile("./src/data/attendance-records.json", attendanceRecords);

  // 2) Lấy correction
  const correctionRecords = await searchLarkRecordsFilterDate(
    clientHrm,
    baseID,
    tableCorectionRecordsId,
    1000,
    "Date of error",
    timestampFrom,
    timestampTo
  );
  writeJsonFile("./src/data/correction-records.json", correctionRecords);

  // 3) Map correction theo id_lookup
  const correctionMap = {};
  for (const c of correctionRecords) {
    const f = c.fields;
    const lookup = f["id_lookup_correction"]?.[0]?.text;
    if (!lookup) continue;

    if (!correctionMap[lookup]) correctionMap[lookup] = [];

    correctionMap[lookup].push({
      replenishment: f["Replenishment time"],
      dateOfError: f["Date of error"],
    });
  }

  // Hàm tạo timestamp 12:30
  function getNoonTimestamp(dateTs) {
    const d = new Date(dateTs);
    d.setUTCHours(12, 30, 0, 0);
    return d.getTime();
  }

  // 4) Build list updates
  const updates = [];

  for (const a of attendanceRecords) {
    const f = a.fields;
    const lookup = f["id_lookup_correction"]?.[0]?.text;
    if (!lookup) continue;

    const matches = correctionMap[lookup];
    if (!matches || matches.length === 0) continue;

    let updateField = {};

    for (const m of matches) {
      const repl = m.replenishment;
      const limit1230 = getNoonTimestamp(m.dateOfError);

      console.log(`Record ID: ${a.record_id} | Replenishment: ${repl} | Limit 12:30: ${limit1230}`);

      if (repl < limit1230) {
        updateField["Check in time(TH)"] = repl;
        updateField["Check in result(TH)"] = "Normal";
      } else {
        updateField["Check out time(TH)"] = repl;
        updateField["Check out result(TH)"] = "Normal";
      }
    }

    updates.push({
      record_id: a.record_id,
      fields: updateField,
    });
  }

  // 5) Update Lark
  if (updates.length > 0) {
    console.log(`=== TIẾN HÀNH UPDATE ${updates.length} RECORDS ===`);
    await updateLarkRecords(clientHrm, baseID, tableAttendanceId, updates);
    console.log("=== UPDATE THÀNH CÔNG ===");
  } else {
    console.log("=== KHÔNG CÓ GÌ ĐỂ UPDATE ===");
  }
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

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

function getHourFromTimestamp(ts) {
  const d = new Date(ts);
  return (d.getUTCHours() + 7) % 24;
}

async function checkCorrectionStatus(
  hrmAppId,
  hrmAppSecret,
  baseID,
  tableAttendanceId,
  tableCorectionRecordsId,
  from,
  to
) {
  console.log(`=== BẮT ĐẦU CHECK TÌNH TRẠNG SỬA GIỜ: ${from} - ${to} ===`);

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

  // 3) Map correction theo id_lookup
  const correctionMap = {};
  for (const c of correctionRecords) {
    const f = c.fields;
    const lookup = f["id_lookup_correction"]?.[0]?.text;
    if (!lookup) continue;

    // Chỉ cho phép trạng thái APPROVED
    const status = f["Status"];
    if (status !== "Approved") {
      console.log(`--> Bỏ qua correction ${lookup} vì Status = ${status}`);
      continue;
    }

    if (!correctionMap[lookup]) correctionMap[lookup] = [];

    correctionMap[lookup].push({
      replenishment: f["Replenishment time"],
      dateOfError: f["Date of error"],
    });
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
      const hour = getHourFromTimestamp(repl);

      const currentCheckIn = f["Check in time(TH)"];
      const currentCheckOut = f["Check out time(TH)"];

      // Nếu đã cập nhật rồi thì bỏ
      if (currentCheckIn === repl || currentCheckOut === repl) {
        console.log(`--> Bỏ qua correction ${lookup} vì replenishment time đã được cập nhật`)
        continue;
      };

      // Nếu giờ < 12 => check-in
      if (hour < 12) {
        updateField["Check in time(TH)"] = repl;
        updateField["Check in result(TH)"] = "Normal";
        updateField["Số phút đi muộn"] = 0;
        updateField["Sau 10p"] = 0;
        updateField["Trước 10p"] = 0;
      }
      // >= 12 => check-out
      else {
        updateField["Check out time(TH)"] = repl;
        updateField["Check out result(TH)"] = "Normal";
        updateField["Số phút về sớm"] = 0;
      }
    }

    // Nếu không có gì để update thì bỏ qua record
    if (Object.keys(updateField).length === 0) continue;

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

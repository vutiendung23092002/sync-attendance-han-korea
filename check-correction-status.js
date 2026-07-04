import {
  searchLarkRecordsFilterDate,
  updateLarkRecords,
} from "./src/services/larkbase/index.js";

import { createLarkClient } from "./src/core/larkbase-client.js";
import {
  getTodayYmd,
  vnTimeToUTCTimestampMiliseconds,
  getFromDateSmart,
} from "./src/utils/common/time-helper.js";
import { env } from "./src/config/env.js";

function toMinutes(timeVal) {
  if (!timeVal) return null;

  // Lark trả về ms timestamp
  const d = new Date(timeVal);
  return d.getHours() * 60 + d.getMinutes();
}

function sameTime(a, b) {
  if (!a || !b) return false;
  return toMinutes(a) === toMinutes(b);
}

function classifyLate(late) {
  if (late === 0) return "Normal";
  if (late <= 10) return "Late";
  return "SeriousLate";
}

async function checkCorrectionStatus(
  hrmAppId,
  hrmAppSecret,
  baseID,
  tableAttendanceId,
  tableCorectionRecordsId,
  from,
  to,
) {
  console.log(`=== BẮT ĐẦU CHECK TÌNH TRẠNG SỬA GIỜ: ${from} - ${to} ===`);

  const ONE_DAY = 24 * 60 * 60 * 1000;
  const timestampFrom = vnTimeToUTCTimestampMiliseconds(from) - ONE_DAY;
  const timestampTo = vnTimeToUTCTimestampMiliseconds(to) + ONE_DAY;

  const clientHrm = await createLarkClient(hrmAppId, hrmAppSecret);

  // 1) Lấy attendance records
  const attendanceRecords = await searchLarkRecordsFilterDate(
    clientHrm,
    baseID,
    tableAttendanceId,
    1000,
    "Date(TH)",
    timestampFrom,
    timestampTo,
  );

  // 2) Lấy correction records
  const correctionRecords = await searchLarkRecordsFilterDate(
    clientHrm,
    baseID,
    tableCorectionRecordsId,
    1000,
    "Date of error",
    timestampFrom,
    timestampTo,
  );

  // 3) Map correction theo lookup ID và chỉ giữ Approved
  const correctionMap = {};
  for (const record of correctionRecords) {
    const f = record.fields;
    const lookup = f["id_lookup_correction"]?.[0]?.text;
    if (!lookup) continue;

    if (f["Status"] !== "Approved") {
      console.log(`--> Skip correction ${lookup} vì chưa Approved`);
      continue;
    }

    // Parse Original record từ bảng correction
    const originalRaw = f["Original record"];
    let originalText = "";

    if (Array.isArray(originalRaw)) {
      originalText = originalRaw.map((i) => i.text).join(" ");
    } else if (originalRaw && typeof originalRaw === "object") {
      originalText = originalRaw.text || "";
    } else if (typeof originalRaw === "string") {
      originalText = originalRaw;
    }

    if (!correctionMap[lookup]) correctionMap[lookup] = [];
    correctionMap[lookup].push({
      replenishment: f["Replenishment time"],
      dateOfError: f["Date of error"],
      originalText,
    });
  }

  // 4) Build list update fields
  const updates = [];

  for (const attendance of attendanceRecords) {
    const f = attendance.fields;
    const lookup = f["id_lookup_correction"]?.[0]?.text;
    if (!lookup) continue;

    const matches = correctionMap[lookup];
    if (!matches || matches.length === 0) continue;

    let updateField = {};

    for (const m of matches) {
      const repl = m.replenishment;

      const originalText = m.originalText || "";
      // console.log("Original correction text:", originalText);
      if (originalText.toLowerCase().includes("start time")) {
        // const isSame = sameTime(f["Check in time(TH)"], repl);
        // if (isSame) {
        //   console.log(`--> Skip ${lookup} vì check-in đã đúng giờ`);
        //   continue;
        // }

        const shiftIn = f["Check in shift time(TH)"];
        const replMin = toMinutes(repl);

        let shiftMin = toMinutes(shiftIn);
        if (shiftMin === 1 * 60 && replMin >= 5 * 60) { // trừ 7 tiếng vì chạy trên github action, nên giờ ca sáng sẽ bị lệch thành 1h sáng, nhưng vẫn tính đi muộn nếu check-in sau 6:30
          shiftMin = 6 * 60 + 30;
        }

        
        const late = Math.max(0, replMin - shiftMin);
        console.log("Calculated replMin:", replMin, " - shiftMin:", shiftMin, " - Late: ", late, " - for record:", lookup);

        updateField["Check in time(TH)"] = repl;
        updateField["Check in result(TH)"] = classifyLate(late);
        updateField["Số phút đi muộn"] = late;
        updateField["Trước 10p"] = Math.min(late, 10);
        updateField["Sau 10p"] = late > 10 ? late - 10 : 0;
      } else if (originalText.toLowerCase().includes("end time")) {
        // const isSame = sameTime(f["Check out time(TH)"], repl);
        // if (isSame) {
        //   console.log(`--> Skip ${lookup} vì check-out đã đúng giờ`);
        //   continue;
        // }

        const shiftOut = f["Check out shift time(TH)"];
        const replMout = toMinutes(repl);
        let shiftMout = toMinutes(shiftOut);

        if (shiftMout >= 10 * 60 + 30 && replMout <= 6 * 60 + 30) {
          shiftMout = 5 * 60;
        }

        const early = Math.max(0, shiftMout - replMout);
        // console.log("Calculated replMout:", replMout, " - shiftMout:", shiftMout, " - Early: ", early, " - for record:", lookup);
        // console.log("Calculated early minutes:", early);

        updateField["Check out time(TH)"] = repl;
        updateField["Check out result(TH)"] = early === 0 ? "Normal" : "Early";
        updateField["Số phút về sớm"] = early;
      }
    }

    if (Object.keys(updateField).length === 0) continue;

    updates.push({
      record_id: attendance.record_id,
      fields: updateField,
    });
  }

  // console.log("Updates:", updates);

  // 5) Update Lark
  if (updates.length > 0) {
    console.log(`=== TIẾN HÀNH UPDATE ${updates.length} RECORDS ===`);
    console.log("Updates:", updates);
    await updateLarkRecords(clientHrm, baseID, tableAttendanceId, updates);
    console.log("=== ID_LOOKUP_CORRECTION ĐÃ ĐƯỢC UPDATE ===");
    for (const a of attendanceRecords) {
      const lookup = a.fields["id_lookup_correction"]?.[0]?.text;
      const isUpdated = updates.some((u) => u.record_id === a.record_id);
      if (isUpdated && lookup) {
        console.log("Lookup updated:", lookup);
      }
    }
  } else {
    console.log("=== KHÔNG CÓ GÌ ĐỂ UPDATE ===");
  }
}

// Env variables
const hrmAppId = env.LARK.hrm_app.app_id;
const hrmAppSecret = env.LARK.hrm_app.app_secret;
const baseID = env.LARK.BASE_ID;
const tableAttendanceId = process.env.TABLE_ATTENDANCE_ID;
const tableCorectionRecordsId = process.env.TABLE_CORECTION_ID;

const from = process.env.FROM
  ? `${process.env.FROM} 00:00:00`
  : `${getFromDateSmart()} 00:00:00`;

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
  to,
);

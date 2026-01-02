import {
  numberYmdToFullDate,
  utcTimestampSToVn,
} from "../common/time-helper.js";
import { generateHash } from "../common/generate-hash.js";

function getMinutesFromHHMM(dateStr) {
  if (!dateStr) return null;
  const time = dateStr.split(" ")[1];
  if (!time) return null;
  const [hh, mm] = time.split(":").map(Number);
  return hh * 60 + mm;
}

function normalizeResult(val) {
  if (!val) return "";
  return String(val).toLowerCase() === "todo" ? "" : val;
}

export function formatAttendanceResults(results) {
  const CUTOFF = 12 * 60 + 30; // 12:30
  const SHIFT_PM_START = 13 * 60 + 30; // 13:30
  const AM_END = 12 * 60; // 12:00
  const PM_SHIFT_END = 17 * 60 + 30; // 17:30

  return results.map((item) => {
    const r = item.records?.[0] ?? {};
    const checkIn = r.check_in_record || {};
    const checkOut = r.check_out_record || {};

    const checkInTime = checkIn.check_time
      ? utcTimestampSToVn(checkIn.check_time)
      : "";
    const checkInShift = r.check_in_shift_time
      ? utcTimestampSToVn(r.check_in_shift_time)
      : "";

    const checkOutTime = checkOut.check_time
      ? utcTimestampSToVn(checkOut.check_time)
      : "";
    const checkOutShift = r.check_out_shift_time
      ? utcTimestampSToVn(r.check_out_shift_time)
      : "";

    const resIn = normalizeResult(r.check_in_result);
    const resOut = normalizeResult(r.check_out_result);

    const inM = getMinutesFromHHMM(checkInTime);
    const outM = getMinutesFromHHMM(checkOutTime);
    const inShiftM = getMinutesFromHHMM(checkInShift);

    // ---- TÍNH ĐI MUỘN CHECK IN ----
    let late = 0;
    if (inM != null) {
      if (inM < CUTOFF) {
        // Ca sáng
        late = inShiftM != null ? inM - inShiftM : 0;
      } else {
        // Ca chiều
        late = inM - SHIFT_PM_START;
      }
    }
    late = late > 0 ? late : 0;
    if(checkInShift="2025/12/22 08:00") {
      console.log(late)
    }

    const lateAfter10 = Math.max(0, late - 10);
    const lateBefore10 = Math.min(late, 10);

    // ---- TÍNH SỚM CHECK OUT ----
    let early = 0;
    if (outM != null) {
      if (outM < CUTOFF) {
        // Ca sáng kết thúc sớm
        early = AM_END - outM;
      } else {
        // Ca chiều kết thúc sớm
        early = PM_SHIFT_END - outM;
      }
    }
    early = early > 0 ? early : 0;

    const formatted = {
      day: numberYmdToFullDate(item.day),
      user_id: item.user_id,
      employee_name: item.employee_name,
      department_name: item.department_name,

      check_in_time: checkInTime,
      check_in_shift_time: checkInShift,
      check_in_result: resIn,

      check_out_time: checkOutTime,
      check_out_shift_time: checkOutShift,
      check_out_result: resOut,

      minutes_late: late,
      minutes_late_after_10m: lateAfter10,
      minutes_late_before_10m: lateBefore10,
      minutes_early: early,

      id_lookup_correction: `${item.user_id}_${item.day}`,
      result_id: item.result_id,
      id: `${item.user_id}_${item.result_id}`,
    };

    formatted.hash = generateHash(formatted);
    return formatted;
  });
}

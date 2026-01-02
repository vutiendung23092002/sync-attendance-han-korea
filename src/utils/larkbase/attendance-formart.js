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

function calcMinutesLate(checkInResult, checkInTime) {
  if (checkInResult === "lack" || checkInResult === "noneedcheck") return 0;
  if (!checkInTime) return 0;

  const inMinutes = getMinutesFromHHMM(checkInTime);
  const CUTOFF = 12 * 60 + 30; // 12:30
  const SHIFT_PM_BASE = 13 * 60 + 30; // 13:30

  // Nếu check in sau 12:30 → tính muộn từ 13:30
  if (inMinutes > CUTOFF) {
    return Math.max(0, inMinutes - SHIFT_PM_BASE);
  }

  // Nếu check in trước 12:30 → không tính muộn nữa theo ca sáng
  return 0;
}

function calcMinutesEarly(checkOutResult, checkOutTime, checkOutShift) {
  if (checkOutResult === "lack" || checkOutResult === "noneedcheck") return 0;
  if (!checkOutTime) return 0;

  const outMinutes = getMinutesFromHHMM(checkOutTime);
  const CUTOFF = 12 * 60 + 30; // 12:30
  const AM_END_BASE = 12 * 60; // 12:00

  // Nếu check out trước 12:30 → tính sớm từ 12:00
  if (outMinutes < CUTOFF) {
    return Math.max(0, AM_END_BASE - outMinutes);
  }

  // Nếu check out sau 12:30 → tính sớm so với giờ shift ca chiều (giữ nguyên shift bạn truyền vào)
  if (checkOutShift) {
    const shiftMinutes = getMinutesFromHHMM(checkOutShift);
    if (shiftMinutes != null && outMinutes != null) {
      return Math.max(0, shiftMinutes - outMinutes);
    }
  }

  return 0;
}

export function formatAttendanceResults(results) {
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

    const checkInResult = normalizeResult(r.check_in_result);
    const checkOutResult = normalizeResult(r.check_out_result);

    const inMinutes = getMinutesFromHHMM(checkInTime);
    const outMinutes = getMinutesFromHHMM(checkOutTime);

    const rawLate = calcMinutesLate(checkInResult, checkInTime);
    const rawEarly = calcMinutesEarly(checkOutResult, checkOutTime, checkOutShift);

    const minutesLate = rawLate;
    const minutesLateAfter10m = Math.max(0, rawLate - 10);
    const minutesLateBefore10m = Math.min(rawLate, 10);
    const minutesEarly = rawEarly;

    const formatted = {
      day: numberYmdToFullDate(item.day),
      user_id: item.user_id,
      employee_name: item.employee_name,
      department_name: item.department_name,

      check_in_time: checkInTime,
      check_in_shift_time: checkInShift,
      check_in_result: checkInResult,

      check_out_time: checkOutTime,
      check_out_shift_time: checkOutShift,
      check_out_result: checkOutResult,

      minutes_late: minutesLate,
      minutes_late_after_10m: minutesLateAfter10m,
      minutes_late_before_10m: minutesLateBefore10m,
      minutes_early: minutesEarly,

      id_lookup_correction: `${item.user_id}_${item.day}`,
      result_id: item.result_id,
      id: `${item.user_id}_${item.result_id}`,
    };

    formatted.hash = generateHash(formatted);
    return formatted;
  });
}

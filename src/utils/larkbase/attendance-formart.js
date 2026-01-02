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

function calcMinutesLate(result, checkInTime, checkInShift) {
  if (result === "lack" || result === "noneedcheck") return 0;
  if (!checkInTime || !checkInShift) return 0;

  const inMinutes = getMinutesFromHHMM(checkInTime);
  const shiftMinutes = getMinutesFromHHMM(checkInShift);
  if (inMinutes == null || shiftMinutes == null) return 0;

  const diff = inMinutes - shiftMinutes;
  return diff > 0 ? diff : 0;
}

export function formatAttendanceResults(results) {
  const CUTOFF = 12 * 60 + 30; // 12:30
  const SHIFT_PM_START = 13 * 60 + 30; // 13:30
  const SHIFT_AM_END = 12 * 60; // 12:00

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

    const inM = getMinutesFromHHMM(checkInTime);
    const outM = getMinutesFromHHMM(checkOutTime);

    const resIn = normalizeResult(r.check_in_result);
    const resOut = normalizeResult(r.check_out_result);

    // Late theo cutoff 12:30
    const minutesLate = inM > CUTOFF
      ? Math.max(0, inM - SHIFT_PM_START)
      : calcMinutesLate(resIn, checkInTime, checkInShift);

    const minutesLateAfter10m = inM > CUTOFF
      ? Math.max(0, (inM - SHIFT_PM_START) - 10)
      : Math.max(0, minutesLate - 10);

    const minutesLateBefore10m = inM > CUTOFF
      ? Math.min(Math.max(0, inM - SHIFT_PM_START), 10)
      : Math.min(minutesLate, 10);

    // Early checkout theo cutoff 12:30
    const minutesEarly = outM < CUTOFF
      ? Math.max(0, SHIFT_AM_END - outM)
      : 0;

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

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

function calcMinutesLateMorning(result, checkInTime, checkInShift) {
  if (result === "Lack" || result === "NoNeedCheck") return 0;
  if (!checkInTime || !checkInShift) return 0;

  const inMinutes = getMinutesFromHHMM(checkInTime);
  const shiftMinutes = getMinutesFromHHMM(checkInShift);
  if (inMinutes == null || shiftMinutes == null) return 0;

  const diff = inMinutes - shiftMinutes;
  return diff > 0 ? diff : 0;
}

function calcMinutesLateAfternoon(result, checkInTime) {
  if (result === "Lack" || result === "NoNeedCheck") return 0;
  if (!checkInTime) return 0;

  const inMinutes = getMinutesFromHHMM(checkInTime);
  const AFTERNOON_SHIFT = 13 * 60 + 30; // 13:30
  const diff = inMinutes - AFTERNOON_SHIFT;
  return diff > 0 ? diff : 0;
}

function calcMinutesEarlyMorning(result, checkOutTime) {
  if (result === "Lack" || result === "NoNeedCheck") return 0;
  if (!checkOutTime) return 0;

  const outMinutes = getMinutesFromHHMM(checkOutTime);
  const MORNING_SHIFT_END = 12 * 60; // 12:00
  const diff = MORNING_SHIFT_END - outMinutes;
  return diff > 0 ? diff : 0;
}

function calcMinutesEarlyAfternoon(result, checkOutTime, checkOutShift) {
  if (result === "Lack" || result === "NoNeedCheck") return 0;
  if (!checkOutTime || !checkOutShift) return 0;

  const outMinutes = getMinutesFromHHMM(checkOutTime);
  const shiftMinutes = getMinutesFromHHMM(checkOutShift);
  if (outMinutes == null || shiftMinutes == null) return 0;

  const diff = shiftMinutes - outMinutes;
  return diff > 0 ? diff : 0;
}

export function formatAttendanceResults(results) {
  const CUTOFF_SHIFT = 12 * 60 + 30; // 12:30

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

    // Check in
    const minutesLate =
      inMinutes > CUTOFF_SHIFT
        ? calcMinutesLateAfternoon(checkInResult, checkInTime)
        : calcMinutesLateMorning(checkInResult, checkInTime, checkInShift);

    const lateAfternoonRaw = calcMinutesLateAfternoon(checkInResult, checkInTime);
    const lateMorningRaw = calcMinutesLateMorning(checkInResult, checkInTime, checkInShift);

    const minutesLateAfter10m =
      inMinutes > CUTOFF_SHIFT
        ? Math.max(0, lateAfternoonRaw - 10)
        : Math.max(0, lateMorningRaw - 10);

    const minutesLateBefore10m =
      inMinutes > CUTOFF_SHIFT
        ? Math.min(lateAfternoonRaw, 10)
        : Math.min(lateMorningRaw, 10);

    // Check out
    const minutesEarly =
      outMinutes < CUTOFF_SHIFT
        ? calcMinutesEarlyMorning(checkOutResult, checkOutTime)
        : calcMinutesEarlyAfternoon(checkOutResult, checkOutTime, checkOutShift);

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

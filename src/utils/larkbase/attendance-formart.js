import {
  numberYmdToFullDate,
  utcTimestampToVn,
} from "../common/time-helper.js";
import { generateHash } from "../common/generate-hash.js";

function getMinutesFromHHMM(dateStr) {
  if (!dateStr) return null;
  const time = dateStr.split(" ")[1];
  if (!time) return null;

  const [hh, mm] = time.split(":").map(Number);
  return hh * 60 + mm;
}

function calcMinutesLate(result, checkInTime, checkInShift) {
  // Điều kiện đặc biệt
  if (result === "Lack" || result === "NoNeedCheck") {
    return 0;
  }

  if (!checkInTime || !checkInShift) return 0;

  const inMinutes = getMinutesFromHHMM(checkInTime);
  const shiftMinutes = getMinutesFromHHMM(checkInShift);

  if (inMinutes == null || shiftMinutes == null) return 0;

  // Nếu vào > 12:00
  if (inMinutes > 12 * 60) return 0;

  const diff = inMinutes - shiftMinutes;
  return diff > 0 ? diff : 0;
}

function calcMinutesEarly(result, checkOutTime, checkOutShift) {
  // Không tính nếu các trạng thái đặc biệt
  if (result === "Lack" || result === "NoNeedCheck") return 0;

  if (!checkOutTime || !checkOutShift) return 0;

  const outMinutes = getMinutesFromHHMM(checkOutTime);
  const shiftMinutes = getMinutesFromHHMM(checkOutShift);

  if (outMinutes == null || shiftMinutes == null) return 0;

  // Nếu ra trước 13:00 thì không tính
  if (outMinutes < 13 * 60) return 0;

  const diff = shiftMinutes - outMinutes;

  return diff > 0 ? diff : 0;
}

export function formatAttendanceResults(results) {
  return results.map((item) => {
    const r = item.records?.[0] ?? {};
    const checkIn = r.check_in_record || {};
    const checkOut = r.check_out_record || {};

    const checkInTime = checkIn.check_time
      ? utcTimestampToVn(checkIn.check_time)
      : "";

    const checkInShift = r.check_in_shift_time
      ? utcTimestampToVn(r.check_in_shift_time)
      : "";

    const checkOutTime = checkOut.check_time
      ? utcTimestampToVn(checkOut.check_time)
      : "";

    const checkOutShift = r.check_out_shift_time
      ? utcTimestampToVn(r.check_out_shift_time)
      : "";

    const formatted = {
      day: numberYmdToFullDate(item.day),
      user_id: item.user_id,
      employee_name: item.employee_name,

      check_in_time: checkIn.check_time
        ? utcTimestampToVn(checkIn.check_time)
        : "",
      check_in_shift_time: r.check_in_shift_time
        ? utcTimestampToVn(r.check_in_shift_time)
        : "",
      check_in_result: r.check_in_result ?? "",
      // check_in_result_supplement: r.check_in_result_supplement ?? "",

      check_out_time: checkOut.check_time
        ? utcTimestampToVn(checkOut.check_time)
        : "",
      check_out_shift_time: r.check_out_shift_time
        ? utcTimestampToVn(r.check_out_shift_time)
        : "",
      check_out_result: r.check_out_result ?? "",
      // check_out_result_supplement: r.check_out_result_supplement ?? "",

      minutes_late: calcMinutesLate(
        r.check_in_result,
        checkInTime,
        checkInShift
      ),

      minutes_late_after_10m: Math.max(
        0,
        calcMinutesLate(r.check_in_result, checkInTime, checkInShift) - 10
      ),

      minutes_late_before_10m: Math.min(
        calcMinutesLate(r.check_in_result, checkInTime, checkInShift),
        10
      ),

      minutes_early: calcMinutesEarly(
        r.check_out_result,
        checkOutTime,
        checkOutShift
      ),

      result_id: item.result_id,
      id: `${item.user_id}_${item.result_id}`,
    };

    formatted.hash = generateHash(formatted);

    return formatted;
  });
}

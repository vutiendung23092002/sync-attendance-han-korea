import { numberYmdToFullDate, utcTimestampToVn } from "../common/time-helper.js";
import { generateHash } from "../common/generate-hash.js";
export function formatAttendanceResults(results) {
  return results.map((item) => {
    const r = item.records?.[0] ?? {};
    const checkIn = r.check_in_record || {};
    const checkOut = r.check_out_record || {};

    const formatted = {
      day: numberYmdToFullDate(item.day),
      user_id: item.user_id,

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

      result_id: item.result_id,
      id: `${item.user_id}_${item.result_id}`,
    };

    formatted.hash = generateHash(formatted);

    return formatted;
  });
}

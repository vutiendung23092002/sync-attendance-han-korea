import { generateHash } from "../common/generate-hash.js";
import {
  utcTimestampToVn,
  numberYmdToFullDate,
} from "../common/time-helper.js";

const STATUS_TEXT_MAP = {
  0: "Under review",
  2: "Approved",
  3: "Canceled",
  4: "Revoked after approval",
};

export function formatCorrectionRecords(records) {
  return records?.map((item) => {
    const formatted = {
      approval_id: item.approval_id ?? "",
      create_time: utcTimestampToVn(item.create_time),
      status: STATUS_TEXT_MAP[item.status] ?? "Unknown",
      remedy_date: numberYmdToFullDate(item.remedy_date),
      reason: item.reason ?? "",
      remedy_time: item.remedy_time,
      user_id: item.user_id ?? "",
      update_time: utcTimestampToVn(item.update_time),
      id_lookup: `${item.user_id}_${item.remedy_date}`,
      // id unique giống style attendance
      id: `${item.user_id}_${item.remedy_date}_${item.approval_id}`,
    };

    formatted.hash = generateHash(formatted);

    return formatted;
  });
}

import { generateHash } from "../common/generate-hash.js";
import {
  utcTimestampMsToVn,
  ymdSlashToNumber,
  vnLocalToUtcISOString,
  utcISOStringToYmd,
} from "../common/time-helper.js";

function capitalizeFirst(str) {
  if (!str) return "";
  const s = str.trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const SUSPICIOUS_START_AFTER_MINUTES = 17 * 60;
const SUSPICIOUS_END_BEFORE_MINUTES = 9 * 60;

function parseOriginalRecord(originalText) {
  const match = String(originalText || "").match(
    /\b(start|end)\s*time\s*(\d{1,2}):(\d{2})\b/i,
  );
  if (!match) return null;

  const hour = Number(match[2]);
  const minute = Number(match[3]);
  if (hour > 23 || minute > 59) return null;

  return {
    type: match[1].toLowerCase(),
    hour,
    minute,
    totalMinutes: hour * 60 + minute,
  };
}

function parseVietnamDateTime(value) {
  if (!value) return null;

  const text = String(value).trim();
  const numericTimestamp = Number(text);
  if (/^\d{10,13}$/.test(text) && Number.isFinite(numericTimestamp)) {
    const timestampMs = text.length === 10 ? numericTimestamp * 1000 : numericTimestamp;
    return getVietnamDateTimeParts(new Date(timestampMs));
  }

  const directMatch = text.match(
    /^(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{1,2}):(\d{2})/,
  );
  const hasExplicitTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);

  if (directMatch && !hasExplicitTimezone) {
    return {
      year: Number(directMatch[1]),
      month: Number(directMatch[2]),
      day: Number(directMatch[3]),
      hour: Number(directMatch[4]),
      minute: Number(directMatch[5]),
    };
  }

  const date = new Date(text);
  if (isNaN(date.getTime())) return null;

  return getVietnamDateTimeParts(date);
}

function getVietnamDateTimeParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(partMap.year),
    month: Number(partMap.month),
    day: Number(partMap.day),
    hour: Number(partMap.hour),
    minute: Number(partMap.minute),
  };
}

function formatDateTimeForNote(dateTime) {
  if (!dateTime) return "";

  const year = String(dateTime.year).padStart(4, "0");
  const month = String(dateTime.month).padStart(2, "0");
  const day = String(dateTime.day).padStart(2, "0");
  const hour = String(dateTime.hour).padStart(2, "0");
  const minute = String(dateTime.minute).padStart(2, "0");
  return `${year}/${month}/${day} ${hour}:${minute}`;
}

function normalizeDateOfError(value) {
  const match = String(value || "").match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (!match) return null;

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function correctSuspiciousReplenishmentTime({
  originalText,
  replenishmentTime,
  dateOfError,
}) {
  const original = parseOriginalRecord(originalText);
  const replenishment = parseVietnamDateTime(replenishmentTime);

  if (!original || !replenishment) {
    return { replenishmentTime, correctionNote: "" };
  }

  const replenishmentMinutes = replenishment.hour * 60 + replenishment.minute;
  const isSuspiciousStart =
    original.type === "start" &&
    original.totalMinutes < SUSPICIOUS_END_BEFORE_MINUTES &&
    replenishmentMinutes > SUSPICIOUS_START_AFTER_MINUTES;
  const isSuspiciousEnd =
    original.type === "end" &&
    original.totalMinutes > SUSPICIOUS_START_AFTER_MINUTES &&
    replenishmentMinutes < SUSPICIOUS_END_BEFORE_MINUTES;

  if (!isSuspiciousStart && !isSuspiciousEnd) {
    return { replenishmentTime, correctionNote: "" };
  }

  const correctionDate = normalizeDateOfError(dateOfError);
  if (!correctionDate) {
    return { replenishmentTime, correctionNote: "" };
  }

  const originalHour = String(original.hour).padStart(2, "0");
  const originalMinute = String(original.minute).padStart(2, "0");
  const correctedTime = vnLocalToUtcISOString(
    `${correctionDate} ${originalHour}:${originalMinute}`,
  );
  const mistakenSide = isSuspiciousStart ? "giờ ra" : "giờ vào";

  return {
    replenishmentTime: correctedTime,
    correctionNote:
      `Nghi ngờ sửa nhầm ${mistakenSide}, Replenishment time gốc: ` +
      formatDateTimeForNote(replenishment),
  };
}

export function formatCorrectionRecordsV2(records) {
  const result = [];

  for (const item of records) {
    let parsedForm = null;
    try {
      parsedForm = item.form ? JSON.parse(item.form) : null;
    } catch (err) {
      console.log("❌ Lỗi parse form:", err.message);
      continue;
    }

    if (!parsedForm?.length) continue;

    const formValue = parsedForm[0]?.value;
    if (!formValue) continue;

    const isBatch = formValue.enableBatchRemedy === true;

    const lastTaskUser =
      item.task_list?.length > 0
        ? item.task_list[item.task_list.length - 1].user_id
        : null;

    const approvalSteps =
      item.task_list?.length > 0
        ? item.task_list[item.task_list.length - 1].node_name
        : null;

    /**
     * ==========================
     * CASE 1: BATCH REMEDY
     * ==========================
     */
    if (isBatch && Array.isArray(formValue.widgetRemedyGroupV2BatchDetail)) {
      for (const batch of formValue.widgetRemedyGroupV2BatchDetail) {
        const remedyDate = batch.widgetRemedyGroupV2BatchRemedyDate;
        const remedyTime = batch.widgetRemedyGroupV2BatchRemedyTime;
        const clockTime = batch.widgetRemedyGroupV2BatchClockTime?.text || "";
        const dateOfError = remedyDate ? utcISOStringToYmd(remedyDate) : "";
        const corrected = correctSuspiciousReplenishmentTime({
          originalText: clockTime,
          replenishmentTime: remedyTime,
          dateOfError,
        });

        const formatted = {
          id: `${item.approval_code}_${item.serial_number}`,
          serial_number: item.serial_number,
          user_id: item.user_id,

          approval_name: item.approval_name,
          department_id: item.department_id,
          department_name: item.department_name,

          status: capitalizeFirst(item.status),

          submitted_at: utcTimestampMsToVn(Number(item.start_time)),
          completed_at:
            item.end_time === "0" || item.end_time === 0
              ? ""
              : utcTimestampMsToVn(Number(item.end_time)),

          approval_steps: approvalSteps,
          last_task_user_id: lastTaskUser,

          original_record: clockTime,
          date_of_error: dateOfError,
          replenishment_time: corrected.replenishmentTime,
          correction_note: corrected.correctionNote,
          reason_for_correction: formValue.widgetRemedyGroupV2Reason || "",

          reverted: item.reverted,

          id_lookup_correction: `${item.user_id}_${ymdSlashToNumber(
            utcISOStringToYmd(remedyDate),
          )}`,
        };

        formatted.hash = generateHash(formatted);
        result.push(formatted);
      }

      continue;
    }

    /**
     * ==========================
     * CASE 2: SINGLE REMEDY
     * ==========================
     */
    const remedyDate = formValue.widgetRemedyGroupV2RemedyDate?.text || "";
    const remedyTime = formValue.widgetRemedyGroupV2RemedyTime?.text || null;
    const clockTime = formValue.widgetRemedyGroupV2ClockTime?.text || "";
    const normalizedRemedyTime = remedyTime
      ? vnLocalToUtcISOString(remedyTime)
      : null;
    const corrected = correctSuspiciousReplenishmentTime({
      originalText: clockTime,
      replenishmentTime: normalizedRemedyTime,
      dateOfError: remedyDate,
    });

    const formatted = {
      id: `${item.approval_code}_${item.serial_number}`,
      serial_number: item.serial_number,
      user_id: item.user_id,

      approval_name: item.approval_name,
      department_id: item.department_id,
      department_name: item.department_name,

      status: capitalizeFirst(item.status),

      submitted_at: utcTimestampMsToVn(Number(item.start_time)),
      completed_at:
        item.end_time === "0" || item.end_time === 0
          ? ""
          : utcTimestampMsToVn(Number(item.end_time)),

      approval_steps: approvalSteps,
      last_task_user_id: lastTaskUser,

      original_record: clockTime,
      date_of_error: remedyDate,
      replenishment_time: corrected.replenishmentTime,
      correction_note: corrected.correctionNote,
      reason_for_correction: formValue.widgetRemedyGroupV2Reason || "",

      reverted: item.reverted,

      id_lookup_correction: `${item.user_id}_${ymdSlashToNumber(remedyDate)}`,
    };

    formatted.hash = generateHash(formatted);
    result.push(formatted);
  }

  return result;
}

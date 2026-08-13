import * as larkbaseService from "./index.js";
import * as utils from "../../utils/index.js";

const RESULT_FIELDS_ALLOW_RESOLVED_UPDATE = new Set([
  "Check in result(TH)",
  "Check out result(TH)",
]);

const RESOLVED_ATTENDANCE_RESULTS = new Set(["normal", "noneedcheck"]);

const CHECK_IN_TIME_FIELD = "Check in time(TH)";
const CHECK_IN_SHIFT_TIME_FIELD = "Check in shift time(TH)";
const CHECK_IN_RESULT_FIELD = "Check in result(TH)";

const CHECK_IN_MINUTE_FIELDS = new Set([
  "Số phút đi muộn",
  "Sau 10p",
  "Trước 10p",
]);

const CHECK_OUT_MINUTE_FIELDS = new Set([
  "Số phút về sớm",
]);

const RESULT_MINUTE_FIELDS = {
  "Check in result(TH)": [...CHECK_IN_MINUTE_FIELDS],
  "Check out result(TH)": [...CHECK_OUT_MINUTE_FIELDS],
};

function normalizeLarkFieldText(value) {
  if (value === undefined || value === null) return "";

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeLarkFieldText(item))
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  if (typeof value === "object") {
    return String(value.text ?? value.value ?? "").trim();
  }

  return String(value).trim();
}

function normalizeLarkFieldNumber(value) {
  const text = normalizeLarkFieldText(value);
  if (!text) return null;

  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function isBlankOrZero(value) {
  const text = normalizeLarkFieldText(value);
  if (!text) return true;

  return normalizeLarkFieldNumber(value) === 0;
}

function isResolvedAttendanceResult(value) {
  const normalized = normalizeLarkFieldText(value).toLowerCase();
  return RESOLVED_ATTENDANCE_RESULTS.has(normalized);
}

function canUpdateResultToResolved(fieldLabel, newValue, mappedFields) {
  if (!RESULT_FIELDS_ALLOW_RESOLVED_UPDATE.has(fieldLabel)) return false;
  if (!isResolvedAttendanceResult(newValue)) return false;

  return RESULT_MINUTE_FIELDS[fieldLabel].every(
    (minuteField) => normalizeLarkFieldNumber(mappedFields?.[minuteField]) === 0
  );
}

function canResetMinuteFieldForResolvedResult(
  fieldLabel,
  newValue,
  mappedFields
) {
  const isCheckInMinuteField =
    CHECK_IN_MINUTE_FIELDS.has(fieldLabel);
  const isCheckOutMinuteField =
    CHECK_OUT_MINUTE_FIELDS.has(fieldLabel);

  if (!isCheckInMinuteField && !isCheckOutMinuteField) return false;

  const newNumber = normalizeLarkFieldNumber(newValue);
  if (newNumber !== 0) return false;

  const resultField = isCheckInMinuteField
    ? "Check in result(TH)"
    : "Check out result(TH)";

  return isResolvedAttendanceResult(mappedFields?.[resultField]);
}

function canFillMinuteFieldForPendingResult(
  fieldLabel,
  oldValue,
  newValue,
  oldRecord,
  mappedFields
) {
  const isCheckInMinuteField = CHECK_IN_MINUTE_FIELDS.has(fieldLabel);
  const isCheckOutMinuteField = CHECK_OUT_MINUTE_FIELDS.has(fieldLabel);

  if (!isCheckInMinuteField && !isCheckOutMinuteField) return false;
  if (!isBlankOrZero(oldValue)) return false;

  const resultField = isCheckInMinuteField
    ? "Check in result(TH)"
    : "Check out result(TH)";
  const oldResult = normalizeLarkFieldText(
    oldRecord?.fields?.[resultField]
  );
  const newResult = normalizeLarkFieldText(mappedFields?.[resultField]);
  const newNumber = normalizeLarkFieldNumber(newValue);

  return (
    !oldResult &&
    Boolean(newResult) &&
    !isResolvedAttendanceResult(newResult) &&
    newNumber !== null &&
    newNumber > 0
  );
}

function canAlignCheckInTimeWithShift(
  fieldLabel,
  oldValue,
  oldRecord,
  mappedFields
) {
  if (fieldLabel !== CHECK_IN_TIME_FIELD) return false;

  const canResolveCheckIn = canUpdateResultToResolved(
    CHECK_IN_RESULT_FIELD,
    mappedFields?.[CHECK_IN_RESULT_FIELD],
    mappedFields
  );
  if (!canResolveCheckIn) return false;

  const oldCheckIn = normalizeLarkFieldNumber(oldValue);
  const oldShift = normalizeLarkFieldNumber(
    oldRecord?.fields?.[CHECK_IN_SHIFT_TIME_FIELD]
  );
  const newShift = normalizeLarkFieldNumber(
    mappedFields?.[CHECK_IN_SHIFT_TIME_FIELD]
  );

  if (oldCheckIn === null || newShift === null) return false;

  const shiftToCompare = oldShift ?? newShift;
  return oldCheckIn !== shiftToCompare;
}

function shouldAllowExcludedFieldUpdate(
  fieldLabel,
  oldValue,
  newValue,
  oldRecord,
  mappedFields
) {
  return (
    canUpdateResultToResolved(fieldLabel, newValue, mappedFields) ||
    canResetMinuteFieldForResolvedResult(
      fieldLabel,
      newValue,
      mappedFields
    ) ||
    canFillMinuteFieldForPendingResult(
      fieldLabel,
      oldValue,
      newValue,
      oldRecord,
      mappedFields
    )
  );
}

/**
 * Đồng bộ dữ liệu vào LarkBase có filter theo khoảng ngày
 */
export async function syncDataToLarkBaseFilterDate(
  client,
  baseId,
  {
    tableName,
    selectFn,
    records = null,
    fieldMap,
    typeMap,
    uiType,
    currencyCode = "VND",
    idLabel = "ID định danh (TTS)",
    excludeUpdateField = null, // string hoặc array
  },
  filterFieldName,
  startDate,
  endDate
) {
  console.log(`=== Đồng bộ dữ liệu lên LarkBase: ${tableName} ===`);

  // Lấy dữ liệu nguồn
  const sourceRecords = records
    ? records
    : await selectFn?.(startDate, endDate);

  const data = sourceRecords || [];
  console.log(`Tổng số bản ghi cần đồng bộ: ${data.length}`);

  if (!data.length) {
    console.warn("Không có dữ liệu để đồng bộ!");
    return;
  }

  // Data cho diff
  const newDataForDiff = data.map((r) => ({
    id: String(r.id),
    hash: r.hash,
  }));

  // Kiểm tra bảng
  const listTb = await larkbaseService.getListTable(client, baseId);
  const table = listTb?.data?.items?.find((t) => t.name === tableName);
  let tableId;

  if (table) {
    console.log(`[LARK] Bảng '${tableName}' đã tồn tại.`);
    tableId = table.table_id;
  } else {
    console.log(`[LARK] Tạo bảng '${tableName}' mới...`);

    const fields = Object.entries(fieldMap).map(([key, label]) =>
      utils.buildField(key, label, typeMap[key], uiType[key], currencyCode)
    );

    tableId = await larkbaseService.ensureLarkBaseTable(
      client,
      baseId,
      tableName,
      fields
    );
  }
  console.log("TABLE_ID:", tableId);

  // Lấy dữ liệu hiện có từ range filter
  const existingRecords = await larkbaseService.searchLarkRecordsFilterDate(
    client,
    baseId,
    tableId,
    1000,
    filterFieldName,
    startDate,
    endDate
  );

  console.log(
    `[LARK] Đã lấy ${existingRecords.length} bản ghi hiện có từ LarkBase.`
  );

  const simplifiedRecords = utils
    .extractLarkIdHash(existingRecords, idLabel)
    .map((r) => ({
      ...r,
      id: String(r.id),
    }));

  const { toUpsert } = utils.diffRecords(
    newDataForDiff,
    simplifiedRecords,
    "id",
    "hash",
    tableName
  );

  const toUpsertIdSet = new Set(toUpsert.map((u) => String(u.id)));

  const larkIdMap = Object.fromEntries(
    simplifiedRecords.map((r) => [String(r.id), r.record_id])
  );

  // Tạo mới
  const toCreate = data
    .filter(
      (r) =>
        toUpsertIdSet.has(String(r.id)) && !larkIdMap[String(r.id)]
    )
    .map((r) => utils.mapFieldsToLark(r, fieldMap, typeMap));

  // ===========================
  // UPDATE — có exclude field
  // ===========================
  const toUpdate = data
    .filter((r) => larkIdMap[String(r.id)])
    .map((r) => {
      const id = String(r.id);
      const mapped = utils.mapFieldsToLark(r, fieldMap, typeMap).fields;
      const shouldUpdateByHash = toUpsertIdSet.has(id);
      let hasAllowedExcludedFieldUpdate = false;

      const excludeList = Array.isArray(excludeUpdateField)
        ? excludeUpdateField
        : excludeUpdateField
        ? [excludeUpdateField]
        : [];

      if (excludeList.length > 0) {
        const oldRecordFull = existingRecords.find(
          (rec) => rec.record_id === larkIdMap[String(r.id)]
        );

        excludeList.forEach((fldLabel) => {
          const oldVal = oldRecordFull?.fields?.[fldLabel];

          const hasOldValue =
            oldVal !== undefined &&
            oldVal !== null &&
            oldVal !== "" &&
            !(Array.isArray(oldVal) && oldVal.length === 0);

          const canAlignCheckIn = canAlignCheckInTimeWithShift(
            fldLabel,
            oldVal,
            oldRecordFull,
            mapped
          );

          if (canAlignCheckIn) {
            mapped[fldLabel] = mapped[CHECK_IN_SHIFT_TIME_FIELD];
          }

          // Nếu có dữ liệu cũ → chỉ update field này khi thỏa ngoại lệ.
          const canUpdateExcludedField =
            canAlignCheckIn ||
            shouldAllowExcludedFieldUpdate(
              fldLabel,
              oldVal,
              mapped[fldLabel],
              oldRecordFull,
              mapped
            );

          if (canUpdateExcludedField && mapped[fldLabel] !== undefined) {
            hasAllowedExcludedFieldUpdate = true;
          }

          if (
            hasOldValue &&
            mapped[fldLabel] !== undefined &&
            !canUpdateExcludedField
          ) {
            delete mapped[fldLabel];
          }
        });
      }

      if (!shouldUpdateByHash && !hasAllowedExcludedFieldUpdate) {
        return null;
      }

      return {
        record_id: larkIdMap[id],
        fields: mapped,
      };
    })
    .filter(Boolean);

  console.log(
    `[LARK] Tạo mới: ${toCreate.length} | Cập nhật: ${toUpdate.length}`
  );

  // Push lên Lark
  await Promise.all([
    toCreate.length
      ? larkbaseService.createLarkRecords(client, baseId, tableId, toCreate)
      : Promise.resolve(),

    toUpdate.length
      ? larkbaseService.updateLarkRecords(client, baseId, tableId, toUpdate)
      : Promise.resolve(),
  ]);

  console.log(`[LARK] Hoàn tất đồng bộ '${tableName}'`);
}

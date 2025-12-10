// Build field for larkbase

export function buildField(key, label, type, uiType, cuCode) {
  if (uiType === "Currency") {
    const formatter = cuCode === "VND" ? "0" : "0.00";

    return {
      field_name: label,
      type,
      ui_type: "Currency",
      property: {
        formatter,
        currency_code: cuCode,
      },
    };
  }

  return {
    field_name: label,
    type,
  };
}

// =========================
// MAPPING FIELD ATTENDANCE
// =========================
export const ATTENDANCE_FIELD_MAP = {
  day: "Date(TH)",
  user_id: "User id(TH)",
  employee_name: "Tên nhân viên",

  check_in_time: "Check in time(TH)",
  check_in_shift_time: "Check in shift time(TH)",
  check_in_result: "Check in result(TH)",

  check_out_time: "Check out time(TH)",
  check_out_shift_time: "Check out shift time(TH)",
  check_out_result: "Check out result(TH)",

  minutes_late: "Số phút đi muộn",
  minutes_late_after_10m: "Sau 10p",
  minutes_late_before_10m: "Trước 10p",

  minutes_early: "Số phút về sớm",

  result_id: "result_id",
  id: "Id",
  hash: "hash",
};

export const ATTENDANCE_TYPE_MAP = {
  day: 5,
  user_id: 1,
  employee: 11,
  employee_name: 1,

  check_in_time: 5,
  check_in_shift_time: 5,
  check_in_result: 1,
  check_in_result_supplement: 5,

  check_out_time: 5,
  check_out_shift_time: 5,
  check_out_result: 1,
  check_out_result_supplement: 5,

  minutes_late: 2,
  minutes_late_after_10m: 2,
  minutes_late_before_10m: 2,

  minutes_early: 2,

  result_id: 1,
  hash: 1,
  id: 1,
};

export const ATTENDANCE_UI_TYPE_MAP = {
  day: "DateTime",
  user_id: "Text",
  employee: "User",
  employee_name: "Text",

  check_in_time: "DateTime",
  check_in_shift_time: "DateTime",
  check_in_result: "DateTime",
  check_in_result_supplement: "DateTime",

  check_out_time: "DateTime",
  check_out_shift_time: "DateTime",
  check_out_result: "DateTime",
  check_out_result_supplement: "DateTime",

  minutes_late: "Number",
  minutes_late_after_10m: "Number",
  minutes_late_before_10m: "Number",

  minutes_early: "Number",

  result_id: "Text",
  hash: "Text",
  id: "Text",
};

export const CORECTION_RECORD_FIELD_MAP = {
  create_time: "Submitted at",
  remedy_date: "Date of error",
  status: "Status",
  reason: "Reason for correction",
  remedy_time: "Replenishment time",
  update_time: "Updated at",
  user_id: "User ID",
  approval_id: "Approval ID",
  hash: "hash",
  id: "Id",
};

export const CORECTION_RECORD_TYPE_MAP = {
  approval_id: 1,
  create_time: 5,
  status: 1,
  remedy_date: 5,
  reason: 1,
  remedy_time: 5,
  user_id: 1,
  update_time: 5,
  hash: 1,
  id: 1,
};

export const CORECTION_RECORD_UI_TYPE_MAP = {
  approval_id: "Text",
  create_time: "DateTime",
  status: "Text",
  remedy_date: "DateTime",
  reason: "Text",
  remedy_time: "DateTime",
  user_id: "Text",
  update_time: "DateTime",
  hash: "Text",
  id: "Text",
};

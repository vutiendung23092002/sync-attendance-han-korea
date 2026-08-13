/**
 * Lấy danh sách toàn bộ bảng (tables) trong một Lark Base.
 *
 * Hàm này gọi endpoint:
 *   POST /open-apis/bitable/v1/apps/{baseId}/tables/query
 * thông qua SDK: `client.bitable.appTable.list()`
 *
 * Ứng dụng:
 * - Kiểm tra bảng tồn tại trước khi tạo mới
 * - Dò danh sách bảng để lấy table_id
 *
 * @async
 * @param {import('@larksuiteoapi/node-sdk').Client} client - Lark OpenAPI client đã được cấu hình app_id/app_secret
 * @param {string} baseId - ID của Base (thuộc tính app_token)
 * @returns {Promise<Object|null>}
 *    - Trả về response dạng:
 *        { data: { items: [...], page_token: null }, ... }
 *    - Trả về null nếu lỗi API (error response)
 */
export async function getListTable(client, baseId) {
  try {
    const res = await client.bitable.appTable.list({
      path: { app_token: baseId },
      params: { page_size: 100 },
    });
    return res;
  } catch (e) {
    console.error("Lỗi Lark API:", e.response?.data || e);
    return null;
  }
}

export async function ensureLarkBaseField(
  client,
  baseId,
  tableId,
  { fieldName, type, uiType },
) {
  let pageToken;
  const seenPageTokens = new Set();

  while (true) {
    console.log(
      `>>> CHECK FIELD '${fieldName}'${pageToken ? " (next page)" : ""}`,
    );

    const listResponse = await client.bitable.appTableField.list({
      path: { app_token: baseId, table_id: tableId },
      params: {
        page_size: 100,
        page_token: pageToken,
      },
    });

    if (listResponse?.code && listResponse.code !== 0) {
      throw new Error(
        `Không thể lấy danh sách field Lark: ${listResponse.msg || "unknown error"}`,
      );
    }

    const fields = listResponse?.data?.items || [];
    if (fields.some((field) => field.field_name === fieldName)) {
      console.log(`>>> FIELD '${fieldName}' ALREADY EXISTS`);
      return;
    }

    if (listResponse?.data?.has_more !== true) break;

    const nextPageToken = listResponse?.data?.page_token;
    if (!nextPageToken || seenPageTokens.has(nextPageToken)) {
      throw new Error(
        `Lark trả về page token không hợp lệ khi kiểm tra field '${fieldName}'.`,
      );
    }

    seenPageTokens.add(nextPageToken);
    pageToken = nextPageToken;
  }

  console.log(`>>> CREATE FIELD '${fieldName}'`);

  const createResponse = await client.bitable.appTableField.create({
    path: { app_token: baseId, table_id: tableId },
    data: {
      field_name: fieldName,
      type,
      ui_type: uiType,
    },
  });

  if (
    (createResponse?.code && createResponse.code !== 0) ||
    !createResponse?.data?.field
  ) {
    throw new Error(
      `Không thể tạo field '${fieldName}': ${createResponse?.msg || "unknown error"}`,
    );
  }

  console.log(`SUCCESS: Đã tạo field '${fieldName}' trong bảng correction.`);
}

/**
 * Tạo bảng mới trong Lark Base nếu bảng chưa tồn tại.
 *
 * Hàm này dùng endpoint:
 *   POST /open-apis/bitable/v1/apps/{baseId}/tables
 *
 * Cấu trúc fields truyền vào:
 * [
 *   {
 *     field_name: "Tên cột",
 *     type: number (1=Text, 2=Number, 5=DateTime, ...),
 *     ui_type: "Text" | "Number" | "Currency" | ...,
 *     property: { ... }  // Optional
 *   }
 * ]
 *
 * Ứng dụng:
 * - Tạo bảng động khi đồng bộ TikTok / Supabase
 * - Generate bảng mới theo fieldMap của dự án
 *
 * @async
 * @param {import('@larksuiteoapi/node-sdk').Client} client - Lark OpenAPI client
 * @param {string} baseId - ID của Base
 * @param {string} tableName - Tên bảng muốn tạo
 * @param {Array<Object>} fields - Danh sách cấu hình field (schema)
 *
 * @returns {Promise<string>}
 *    - Trả về table_id của bảng vừa tạo
 *    - Throw error nếu API trả lỗi hoặc không tạo được bảng
 *
 * @throws {Error} Lỗi từ phía Lark API:
 *    - Thiếu quyền (insufficient permission)
 *    - Tên bảng trùng (duplicate table)
 *    - Schema không hợp lệ
 */
export async function ensureLarkBaseTable(client, baseId, tableName, fields) {
  try {
    const res = await client.bitable.appTable.create({
      path: { app_token: baseId },
      data: { table: { name: tableName, default_view_name: "Grid", fields } },
    });

    // if (!res?.data?.table_id) throw new Error("Không nhận được table_id");

    console.log(
      "SUCCESS:",
      `Đã tạo bảng '${tableName}' (ID: ${res.data.table_id})`
    );
    return res.data.table_id;
  } catch (err) {
    const errMsg = err.response?.data
      ? JSON.stringify(err.response.data, null, 2)
      : err.message;
    console.log("ERROR:", `Lỗi tạo bảng '${tableName}': ${errMsg}`);
    throw err;
  }
}

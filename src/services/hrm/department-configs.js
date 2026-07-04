import { queryPostgres } from "../../core/postgres-client.js";

const DEFAULT_HRM_SCHEMA = process.env.SUPABASE_HRM_SCHEMA || "han_hrm";

function quoteIdentifier(value) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Invalid PostgreSQL identifier: ${value}`);
  }

  return `"${value}"`;
}

export async function getAttendanceDepartmentConfigs(
  schemaName = DEFAULT_HRM_SCHEMA
) {
  const schema = quoteIdentifier(schemaName);

  return queryPostgres(
    `
      SELECT DISTINCT ON (d.id)
        d.name AS ten_phong_ban,
        d.lark_department_id AS id_phongban,
        d.approval_code_leave,
        d.approval_code_correction,
        a.app_id AS lark_app_id,
        a.app_secret AS lark_app_secret
      FROM ${schema}.users u
      JOIN ${schema}.departments d ON d.id = u.department_id
      JOIN ${schema}.apps a ON a.org_id = d.org_id AND a.type = $1
      WHERE u.department_id IS NOT NULL
      ORDER BY d.id
    `,
    ["attendance"]
  );
}

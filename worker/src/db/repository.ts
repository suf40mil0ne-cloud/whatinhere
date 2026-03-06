import type { NormalizedProject } from "../types";

export interface ProjectQuery {
  swLng: number;
  swLat: number;
  neLng: number;
  neLat: number;
  status?: string;
  use?: string;
  sort?: string;
  limit?: number;
}

export class Repository {
  constructor(private readonly db: D1Database) {}

  async insertRaw(payload: {
    rawId: string;
    sourceId: string;
    fetchedAt: string;
    rawPayloadJson: string;
    rawHash: string;
    sourceRecordId?: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO raw_ingest (raw_id, source_id, fetched_at, raw_payload_json, raw_hash, source_record_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        payload.rawId,
        payload.sourceId,
        payload.fetchedAt,
        payload.rawPayloadJson,
        payload.rawHash,
        payload.sourceRecordId ?? null
      )
      .run();
  }

  async existsRawHash(rawHash: string): Promise<boolean> {
    const row = await this.db.prepare("SELECT raw_id FROM raw_ingest WHERE raw_hash = ? LIMIT 1").bind(rawHash).first();
    return !!row;
  }

  async upsertProject(project: NormalizedProject): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO normalized_projects (
          project_id, title, source_priority, address_road, address_jibun, lat, lng,
          permit_type, main_use, sub_use, permit_date, start_date, approval_date,
          status_normalized, building_area, gross_floor_area, floors_above, floors_below,
          households, contractor, designer, supervisor, local_government, source_count,
          confidence_score, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(project_id) DO UPDATE SET
          title = excluded.title,
          source_priority = excluded.source_priority,
          address_road = excluded.address_road,
          address_jibun = excluded.address_jibun,
          lat = excluded.lat,
          lng = excluded.lng,
          permit_type = excluded.permit_type,
          main_use = excluded.main_use,
          sub_use = excluded.sub_use,
          permit_date = excluded.permit_date,
          start_date = excluded.start_date,
          approval_date = excluded.approval_date,
          status_normalized = excluded.status_normalized,
          building_area = excluded.building_area,
          gross_floor_area = excluded.gross_floor_area,
          floors_above = excluded.floors_above,
          floors_below = excluded.floors_below,
          households = excluded.households,
          contractor = excluded.contractor,
          designer = excluded.designer,
          supervisor = excluded.supervisor,
          local_government = excluded.local_government,
          source_count = excluded.source_count,
          confidence_score = excluded.confidence_score,
          updated_at = CURRENT_TIMESTAMP`
      )
      .bind(
        project.project_id,
        project.title,
        project.source_priority,
        project.address_road,
        project.address_jibun,
        project.lat,
        project.lng,
        project.permit_type,
        project.main_use,
        project.sub_use,
        project.permit_date,
        project.start_date,
        project.approval_date,
        project.status_normalized,
        project.building_area,
        project.gross_floor_area,
        project.floors_above,
        project.floors_below,
        project.households,
        project.contractor,
        project.designer,
        project.supervisor,
        project.local_government,
        project.source_count,
        project.confidence_score
      )
      .run();
  }

  async addStatusHistory(payload: {
    historyId: string;
    projectId: string;
    sourceId: string;
    rawStatus?: string;
    normalizedStatus: string;
    statusDate?: string | null;
    note?: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO project_status_history (
          history_id, project_id, source_id, raw_status, normalized_status, status_date, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        payload.historyId,
        payload.projectId,
        payload.sourceId,
        payload.rawStatus ?? null,
        payload.normalizedStatus,
        payload.statusDate ?? null,
        payload.note ?? null
      )
      .run();
  }

  async findCandidates(project: NormalizedProject): Promise<NormalizedProject[]> {
    const byAddress = project.address_road || project.address_jibun;
    if (!byAddress && (project.lat == null || project.lng == null)) return [];

    let rows: D1Result<NormalizedProject>;

    if (project.lat != null && project.lng != null) {
      rows = await this.db
        .prepare(
          `SELECT * FROM normalized_projects
           WHERE lat BETWEEN ? AND ?
             AND lng BETWEEN ? AND ?
           LIMIT 50`
        )
        .bind(project.lat - 0.01, project.lat + 0.01, project.lng - 0.01, project.lng + 0.01)
        .all<NormalizedProject>();
      return rows.results;
    }

    rows = await this.db
      .prepare(
        `SELECT * FROM normalized_projects
         WHERE address_road LIKE ? OR address_jibun LIKE ?
         LIMIT 50`
      )
      .bind(`%${byAddress}%`, `%${byAddress}%`)
      .all<NormalizedProject>();

    return rows.results;
  }

  async listProjects(query: ProjectQuery): Promise<NormalizedProject[]> {
    const where = ["lat IS NOT NULL", "lng IS NOT NULL", "lng BETWEEN ? AND ?", "lat BETWEEN ? AND ?"];
    const binds: Array<string | number> = [query.swLng, query.neLng, query.swLat, query.neLat];

    if (query.status) {
      where.push("status_normalized = ?");
      binds.push(query.status);
    }
    if (query.use) {
      where.push("main_use LIKE ?");
      binds.push(`%${query.use}%`);
    }

    const orderBy =
      query.sort === "start_desc"
        ? "start_date DESC"
        : query.sort === "gfa_desc"
          ? "gross_floor_area DESC"
          : "permit_date DESC";

    const sql = `SELECT * FROM normalized_projects WHERE ${where.join(" AND ")} ORDER BY ${orderBy} LIMIT ?`;
    binds.push(query.limit ?? 500);

    const rows = await this.db.prepare(sql).bind(...binds).all<NormalizedProject>();
    return rows.results;
  }

  async countProjectsInBounds(query: ProjectQuery): Promise<number> {
    const row = await this.db
      .prepare(
        `SELECT COUNT(*) as cnt
         FROM normalized_projects
         WHERE lat IS NOT NULL AND lng IS NOT NULL
           AND lng BETWEEN ? AND ?
           AND lat BETWEEN ? AND ?`
      )
      .bind(query.swLng, query.neLng, query.swLat, query.neLat)
      .first<{ cnt: number }>();

    return Number(row?.cnt ?? 0);
  }

  async countByStatusInBounds(query: ProjectQuery): Promise<Record<string, number>> {
    const rows = await this.db
      .prepare(
        `SELECT status_normalized, COUNT(*) as cnt
         FROM normalized_projects
         WHERE lat IS NOT NULL AND lng IS NOT NULL
           AND lng BETWEEN ? AND ?
           AND lat BETWEEN ? AND ?
         GROUP BY status_normalized`
      )
      .bind(query.swLng, query.neLng, query.swLat, query.neLat)
      .all<{ status_normalized: string; cnt: number }>();

    return rows.results.reduce<Record<string, number>>((acc, row) => {
      acc[row.status_normalized] = Number(row.cnt);
      return acc;
    }, {});
  }

  async getProject(projectId: string): Promise<NormalizedProject | null> {
    const row = await this.db.prepare("SELECT * FROM normalized_projects WHERE project_id = ?").bind(projectId).first<NormalizedProject>();
    return row ?? null;
  }

  async searchProjects(q: string, limit = 50): Promise<NormalizedProject[]> {
    const keyword = `%${q}%`;
    const rows = await this.db
      .prepare(
        `SELECT * FROM normalized_projects
         WHERE title LIKE ?
            OR address_road LIKE ?
            OR address_jibun LIKE ?
            OR main_use LIKE ?
         ORDER BY updated_at DESC
         LIMIT ?`
      )
      .bind(keyword, keyword, keyword, keyword, limit)
      .all<NormalizedProject>();

    return rows.results;
  }
}

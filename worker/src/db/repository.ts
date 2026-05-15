import type { AptCommentRow, AptComplexRow, AptUserCommentRow, ApiBattleComment, ApiBattleDispute, AptRanking, BattleDisputeRow, BattleCommentRow, BattleRow, CommentFeedItem, CommentFeedRow, DistrictScoreRow, NormalizedProject, UserRow } from "../types";

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

export interface DistrictQuery {
  swLng: number;
  swLat: number;
  neLng: number;
  neLat: number;
  limit?: number;
}

const APT_RESOLVED_COLUMNS = `
  a.id,
  a.name,
  a.address,
  a.lat,
  a.lng,
  a.district_code,
  a.built_year,
  a.total_units,
  a.avg_price_per_m2,
  a.price_source,
  COALESCE(NULLIF(a.s_transport, 0), d.s_transport) AS s_transport,
  COALESCE(NULLIF(a.s_walk, 0), d.s_walk) AS s_walk,
  COALESCE(NULLIF(a.s_value, 0), d.s_value) AS s_value,
  COALESCE(NULLIF(a.s_childcare, 0), d.s_childcare) AS s_childcare,
  COALESCE(NULLIF(a.s_safety, 0), d.s_safety) AS s_safety,
  a.s_scale,
  a.overall_score_adjusted,
  a.updated_at
`;

const APT_RESOLVED_COLUMNS_WITH_RAW = `
  ${APT_RESOLVED_COLUMNS},
  d.raw_transport,
  d.raw_walk,
  d.raw_value,
  d.raw_childcare,
  d.raw_safety
`;

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

  async listDistricts(query: DistrictQuery): Promise<DistrictScoreRow[]> {
    const rows = await this.db
      .prepare(
        `SELECT *
         FROM district_scores
         WHERE center_lat IS NOT NULL
           AND center_lng IS NOT NULL
           AND center_lng BETWEEN ? AND ?
           AND center_lat BETWEEN ? AND ?
         ORDER BY s_overall DESC, code ASC
         LIMIT ?`
      )
      .bind(query.swLng, query.neLng, query.swLat, query.neLat, query.limit ?? 3000)
      .all<DistrictScoreRow>();

    return rows.results;
  }

  async countDistrictsInBounds(query: DistrictQuery): Promise<number> {
    const row = await this.db
      .prepare(
        `SELECT COUNT(*) AS cnt
         FROM district_scores
         WHERE center_lat IS NOT NULL
           AND center_lng IS NOT NULL
           AND center_lng BETWEEN ? AND ?
           AND center_lat BETWEEN ? AND ?`
      )
      .bind(query.swLng, query.neLng, query.swLat, query.neLat)
      .first<{ cnt: number }>();

    return Number(row?.cnt ?? 0);
  }

  async getDistrictByCode(code: string): Promise<DistrictScoreRow | null> {
    const row = await this.db
      .prepare("SELECT * FROM district_scores WHERE code = ?")
      .bind(code)
      .first<DistrictScoreRow>();
    return row ?? null;
  }

  async insertVote(payload: { id: string; districtCode: string; category: string; score: number }): Promise<void> {
    await this.db
      .prepare(`INSERT INTO user_votes (id, district_code, category, score) VALUES (?, ?, ?, ?)`)
      .bind(payload.id, payload.districtCode, payload.category, payload.score)
      .run();
  }

  // ── Apartments ───────────────────────────────────────────────────────────────

  async listApts(query: DistrictQuery): Promise<AptComplexRow[]> {
    const rows = await this.db
      .prepare(
        `SELECT ${APT_RESOLVED_COLUMNS_WITH_RAW}
         FROM apt_complexes a
         LEFT JOIN district_scores d ON d.code = a.district_code
         WHERE a.lat IS NOT NULL
           AND a.lng IS NOT NULL
           AND a.lng BETWEEN ? AND ?
           AND a.lat BETWEEN ? AND ?
         ORDER BY a.name ASC
         LIMIT ?`
      )
      .bind(query.swLng, query.neLng, query.swLat, query.neLat, query.limit ?? 500)
      .all<AptComplexRow & { raw_transport: string | null; raw_walk: string | null; raw_value: string | null; raw_childcare: string | null; raw_safety: string | null }>();

    return rows.results;
  }

  async countAptsInBounds(query: DistrictQuery): Promise<number> {
    const row = await this.db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM apt_complexes
         WHERE lat IS NOT NULL AND lng IS NOT NULL
           AND lng BETWEEN ? AND ? AND lat BETWEEN ? AND ?`
      )
      .bind(query.swLng, query.neLng, query.swLat, query.neLat)
      .first<{ cnt: number }>();
    return Number(row?.cnt ?? 0);
  }

  async getAptById(id: string): Promise<(AptComplexRow & { raw_transport: string | null; raw_walk: string | null; raw_value: string | null; raw_childcare: string | null; raw_safety: string | null; comments: AptCommentRow[] }) | null> {
    const row = await this.db
      .prepare(
        `SELECT ${APT_RESOLVED_COLUMNS_WITH_RAW}
         FROM apt_complexes a
         LEFT JOIN district_scores d ON d.code = a.district_code
         WHERE a.id = ?`
      )
      .bind(id)
      .first<AptComplexRow & { raw_transport: string | null; raw_walk: string | null; raw_value: string | null; raw_childcare: string | null; raw_safety: string | null }>();
    if (!row) return null;

    const comments = await this.db
      .prepare(`SELECT * FROM apt_comments WHERE apt_id = ? ORDER BY likes DESC, created_at DESC`)
      .bind(id)
      .all<AptCommentRow>();

    return { ...row, comments: comments.results };
  }

  async insertComment(payload: { id: string; aptId: string; category: string | null; comment: string; userScore: number | null }): Promise<void> {
    await this.db
      .prepare(`INSERT INTO apt_comments (id, apt_id, category, comment, user_score) VALUES (?, ?, ?, ?, ?)`)
      .bind(payload.id, payload.aptId, payload.category ?? null, payload.comment, payload.userScore ?? null)
      .run();
  }

  async likeComment(commentId: string): Promise<void> {
    await this.db
      .prepare(`UPDATE apt_comments SET likes = likes + 1 WHERE id = ?`)
      .bind(commentId)
      .run();
  }

  // ── Users / Sessions ─────────────────────────────────────────────────────────

  async upsertUser(user: { id: string; nickname: string; profileImg: string | null }): Promise<void> {
    await this.db.prepare(
      `INSERT INTO users (id, nickname, profile_img) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET profile_img=excluded.profile_img`
    ).bind(user.id, user.nickname, user.profileImg ?? null).run();
  }

  async updateUserNickname(userId: string, nickname: string): Promise<void> {
    await this.db.prepare(`UPDATE users SET nickname=? WHERE id=?`).bind(nickname, userId).run();
  }

  async createSession(token: string, userId: string, expiresAt: string): Promise<void> {
    await this.db.prepare(
      `INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`
    ).bind(token, userId, expiresAt).run();
  }

  async getSessionUser(token: string): Promise<(UserRow & { expires_at: string }) | null> {
    const row = await this.db.prepare(
      `SELECT u.*, s.expires_at FROM users u
       JOIN sessions s ON s.user_id = u.id
       WHERE s.token = ?`
    ).bind(token).first<UserRow & { expires_at: string }>();
    return row ?? null;
  }

  async deleteSession(token: string): Promise<void> {
    await this.db.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
  }

  // ── Battles ──────────────────────────────────────────────────────────────────

  async createBattle(battle: {
    id: string; aptAId: string; aptBId: string;
    aptAName: string; aptBName: string;
    winner: string | null; scoreA: string; scoreB: string;
  }): Promise<void> {
    await this.db.prepare(
      `INSERT INTO battles (id, apt_a_id, apt_b_id, apt_a_name, apt_b_name, winner, score_a, score_b)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(battle.id, battle.aptAId, battle.aptBId, battle.aptAName, battle.aptBName,
      battle.winner, battle.scoreA, battle.scoreB).run();
  }

  async getBattle(id: string, currentUserId?: string): Promise<(BattleRow & { comments: ApiBattleComment[]; disputes: ApiBattleDispute[] }) | null> {
    await this.db.prepare(`UPDATE battles SET view_count = view_count + 1 WHERE id = ?`).bind(id).run();
    const row = await this.db.prepare(`SELECT * FROM battles WHERE id = ?`).bind(id).first<BattleRow>();
    if (!row) return null;

    const commentsRaw = await this.db.prepare(
      `SELECT bc.*, u.nickname, u.profile_img FROM battle_comments bc
       JOIN users u ON u.id = bc.user_id
       WHERE bc.battle_id = ? ORDER BY bc.likes DESC, bc.created_at DESC`
    ).bind(id).all<BattleCommentRow & { nickname: string; profile_img: string | null }>();

    const likedSet = new Set<string>();
    if (currentUserId) {
      const liked = await this.db.prepare(
        `SELECT comment_id FROM comment_likes WHERE user_id = ? AND comment_id IN (SELECT id FROM battle_comments WHERE battle_id = ?)`
      ).bind(currentUserId, id).all<{ comment_id: string }>();
      for (const l of liked.results) likedSet.add(l.comment_id);
    }

    const comments: ApiBattleComment[] = commentsRaw.results.map((c) => ({
      id: c.id, battleId: c.battle_id, userId: c.user_id,
      nickname: c.nickname, profileImg: c.profile_img,
      comment: c.comment, likes: c.likes,
      likedByMe: likedSet.has(c.id),
      createdAt: c.created_at,
    }));

    const disputesRaw = await this.db.prepare(
      `SELECT * FROM battle_disputes WHERE battle_id = ? ORDER BY created_at DESC`
    ).bind(id).all<BattleDisputeRow>();

    const disputes: ApiBattleDispute[] = disputesRaw.results.map((d) => ({
      id: d.id, category: d.category, reason: d.reason, createdAt: d.created_at,
    }));

    return { ...row, comments, disputes };
  }

  async addBattleComment(payload: { id: string; battleId: string; userId: string; comment: string }): Promise<void> {
    await this.db.prepare(
      `INSERT INTO battle_comments (id, battle_id, user_id, comment) VALUES (?, ?, ?, ?)`
    ).bind(payload.id, payload.battleId, payload.userId, payload.comment).run();
  }

  async likeBattleComment(userId: string, commentId: string): Promise<void> {
    const inserted = await this.db.prepare(
      `INSERT OR IGNORE INTO comment_likes (user_id, comment_id) VALUES (?, ?)`
    ).bind(userId, commentId).run();
    if (inserted.meta.changes > 0) {
      await this.db.prepare(`UPDATE battle_comments SET likes = likes + 1 WHERE id = ?`).bind(commentId).run();
    }
  }

  async getCommentsFeed(opts: {
    sort: "recent" | "hot" | "active";
    limit: number;
    offset: number;
    currentUserId?: string;
  }): Promise<{ comments: CommentFeedItem[]; hasMore: boolean }> {
    const orderBy =
      opts.sort === "hot"    ? "bc.likes DESC, bc.created_at DESC" :
      opts.sort === "active" ? "bcc.cnt DESC, bc.created_at DESC" :
                               "bc.created_at DESC";

    const activeJoin = opts.sort === "active"
      ? `JOIN (SELECT battle_id, COUNT(*) as cnt FROM battle_comments GROUP BY battle_id) bcc ON bcc.battle_id = bc.battle_id`
      : "";

    const rows = await this.db.prepare(
      `SELECT bc.id, bc.battle_id, bc.comment, bc.likes, bc.created_at,
              u.nickname, u.profile_img,
              b.apt_a_name, b.apt_b_name, b.winner
       FROM battle_comments bc
       JOIN users u ON u.id = bc.user_id
       JOIN battles b ON b.id = bc.battle_id
       ${activeJoin}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`
    ).bind(opts.limit + 1, opts.offset).all<CommentFeedRow>();

    const hasMore = rows.results.length > opts.limit;
    const items = rows.results.slice(0, opts.limit);

    const likedSet = new Set<string>();
    if (opts.currentUserId && items.length > 0) {
      const ids = items.map(r => `'${r.id}'`).join(",");
      const liked = await this.db.prepare(
        `SELECT comment_id FROM comment_likes WHERE user_id = ? AND comment_id IN (${ids})`
      ).bind(opts.currentUserId).all<{ comment_id: string }>();
      for (const l of liked.results) likedSet.add(l.comment_id);
    }

    return {
      comments: items.map(r => ({
        id: r.id,
        battleId: r.battle_id,
        comment: r.comment,
        likes: r.likes,
        likedByMe: likedSet.has(r.id),
        createdAt: r.created_at,
        nickname: r.nickname,
        profileImg: r.profile_img,
        aptAName: r.apt_a_name,
        aptBName: r.apt_b_name,
        winner: r.winner,
      })),
      hasMore,
    };
  }

  async addDispute(payload: { id: string; battleId: string; userId: string | null; category: string; reason: string }): Promise<void> {
    await this.db.prepare(
      `INSERT INTO battle_disputes (id, battle_id, user_id, category, reason) VALUES (?, ?, ?, ?, ?)`
    ).bind(payload.id, payload.battleId, payload.userId ?? null, payload.category, payload.reason).run();
  }

  async getRanking(filters: { sido?: string; sigungu?: string }): Promise<AptRanking[]> {
    // Build ranking from battles table
    const rows = await this.db.prepare(`
      SELECT a.id, a.name, a.address,
             d.sido, d.sigungu,
             SUM(CASE WHEN (b.apt_a_id = a.id AND b.winner = 'a') OR (b.apt_b_id = a.id AND b.winner = 'b') THEN 1 ELSE 0 END) as wins,
             SUM(CASE WHEN (b.apt_a_id = a.id AND b.winner = 'b') OR (b.apt_b_id = a.id AND b.winner = 'a') THEN 1 ELSE 0 END) as losses,
             SUM(CASE WHEN b.winner = 'draw' THEN 1 ELSE 0 END) as draws,
             COUNT(b.id) as total
      FROM apt_complexes a
      LEFT JOIN district_scores d ON d.code = a.district_code
      LEFT JOIN battles b ON b.apt_a_id = a.id OR b.apt_b_id = a.id
      ${filters.sido ? `WHERE d.sido = '${filters.sido.replace(/'/g, "''")}'` : ""}
      ${filters.sido && filters.sigungu ? `AND d.sigungu = '${filters.sigungu.replace(/'/g, "''")}'` : ""}
      ${!filters.sido && filters.sigungu ? `WHERE d.sigungu = '${filters.sigungu.replace(/'/g, "''")}'` : ""}
      GROUP BY a.id
      HAVING total > 0
      ORDER BY (wins * 1.0 / total) DESC, wins DESC
      LIMIT 50
    `).all<AptRanking & { wins: number; losses: number; draws: number; total: number }>();

    return rows.results.map((r) => ({
      ...r,
      winRate: r.total > 0 ? Math.round((r.wins / r.total) * 100) : 0,
    }));
  }

  async getHotBattles(): Promise<{ byDisputes: BattleRow[]; byViews: BattleRow[] }> {
    const byDisputes = await this.db.prepare(`
      SELECT b.*, COUNT(bd.id) as dispute_count
      FROM battles b LEFT JOIN battle_disputes bd ON bd.battle_id = b.id
      GROUP BY b.id ORDER BY dispute_count DESC LIMIT 20
    `).all<BattleRow>();

    const byViews = await this.db.prepare(
      `SELECT * FROM battles ORDER BY view_count DESC LIMIT 20`
    ).all<BattleRow>();

    return { byDisputes: byDisputes.results, byViews: byViews.results };
  }

  async getAptById2(id: string): Promise<AptComplexRow | null> {
    return this.db
      .prepare(
        `SELECT ${APT_RESOLVED_COLUMNS}
         FROM apt_complexes a
         LEFT JOIN district_scores d ON d.code = a.district_code
         WHERE a.id = ?`
      )
      .bind(id)
      .first<AptComplexRow>() as Promise<AptComplexRow | null>;
  }

  async searchAptSidos(): Promise<string[]> {
    const rows = await this.db.prepare(
      `SELECT DISTINCT d.sido FROM apt_complexes a
       JOIN district_scores d ON d.code = a.district_code
       WHERE d.sido IS NOT NULL ORDER BY d.sido`
    ).all<{ sido: string }>();
    return rows.results.map((r) => r.sido);
  }

  async searchAptSigungus(sido: string): Promise<string[]> {
    const rows = await this.db.prepare(
      `SELECT DISTINCT d.sigungu FROM apt_complexes a
       JOIN district_scores d ON d.code = a.district_code
       WHERE d.sido = ? AND d.sigungu IS NOT NULL ORDER BY d.sigungu`
    ).bind(sido).all<{ sigungu: string }>();
    return rows.results.map((r) => r.sigungu);
  }

  async searchAptDongs(sido: string, sigungu: string): Promise<string[]> {
    const rows = await this.db.prepare(
      `SELECT DISTINCT d.dong FROM apt_complexes a
       JOIN district_scores d ON d.code = a.district_code
       WHERE d.sido = ? AND d.sigungu = ? AND d.dong IS NOT NULL ORDER BY d.dong`
    ).bind(sido, sigungu).all<{ dong: string }>();
    return rows.results.map((r) => r.dong);
  }

  async searchAptsByDong(sido: string, sigungu: string, dong: string, name?: string): Promise<AptComplexRow[]> {
    if (name) {
      const rows = await this.db.prepare(
        `SELECT ${APT_RESOLVED_COLUMNS} FROM apt_complexes a
         JOIN district_scores d ON d.code = a.district_code
         WHERE d.sido = ? AND d.sigungu = ? AND d.dong = ? AND a.name LIKE ?
         ORDER BY a.name LIMIT 50`
      ).bind(sido, sigungu, dong, `%${name}%`).all<AptComplexRow>();
      return rows.results;
    }
    const rows = await this.db.prepare(
      `SELECT ${APT_RESOLVED_COLUMNS} FROM apt_complexes a
       JOIN district_scores d ON d.code = a.district_code
       WHERE d.sido = ? AND d.sigungu = ? AND d.dong = ?
       ORDER BY a.name LIMIT 100`
    ).bind(sido, sigungu, dong).all<AptComplexRow>();
    return rows.results;
  }

  async getNearbyApts(aptId: string): Promise<Array<{
    id: string; name: string; address: string | null; overall_score: number | null;
  }>> {
    const rc = (col: string) => `COALESCE(NULLIF(a2.${col},0), d2.${col})`;
    const scoreKeys = ["s_transport", "s_walk", "s_value", "s_childcare", "s_safety"] as const;
    const nullCount = scoreKeys.map((c) => `CASE WHEN ${rc(c)} IS NOT NULL THEN 1 ELSE 0 END`).join(" + ");
    const computedOverall = `(${scoreKeys.map((c) => rc(c)).join(" + ")}) / NULLIF(${nullCount}, 0)`;
    const scoreExpr = `COALESCE(a2.overall_score_adjusted, ${computedOverall})`;

    const rows = await this.db.prepare(`
      SELECT a2.id, a2.name, a2.address,
        (${scoreExpr}) AS overall_score
      FROM apt_complexes a2
      LEFT JOIN district_scores d2 ON d2.code = a2.district_code
      WHERE d2.sigungu = (
        SELECT d.sigungu FROM apt_complexes a
        LEFT JOIN district_scores d ON d.code = a.district_code
        WHERE a.id = ?
      )
      AND a2.id != ?
      ORDER BY COALESCE((${scoreExpr}), 0) DESC
      LIMIT 5
    `).bind(aptId, aptId).all<{ id: string; name: string; address: string | null; overall_score: number | null }>();

    return rows.results;
  }

  // ── Apt User Comments ────────────────────────────────────────────────────────

  async listAptUserComments(aptId: string): Promise<AptUserCommentRow[]> {
    const rows = await this.db
      .prepare(`SELECT * FROM apt_user_comments WHERE apt_id = ? AND is_hidden = 0 ORDER BY created_at DESC LIMIT 50`)
      .bind(aptId)
      .all<AptUserCommentRow>();
    return rows.results;
  }

  async insertAptUserComment(payload: { id: string; aptId: string; userId: string; userName: string; userPhoto: string | null; content: string }): Promise<void> {
    await this.db
      .prepare(`INSERT INTO apt_user_comments (id, apt_id, user_id, user_name, user_photo, content) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(payload.id, payload.aptId, payload.userId, payload.userName, payload.userPhoto ?? null, payload.content)
      .run();
  }

  async deleteAptUserComment(commentId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .prepare(`DELETE FROM apt_user_comments WHERE id = ? AND user_id = ?`)
      .bind(commentId, userId)
      .run();
    return (result.meta.changes ?? 0) > 0;
  }

  async countAptUserCommentsByUserToday(userId: string): Promise<number> {
    const row = await this.db
      .prepare(`SELECT COUNT(*) AS cnt FROM apt_user_comments WHERE user_id = ? AND date(created_at) = date('now')`)
      .bind(userId)
      .first<{ cnt: number }>();
    return Number(row?.cnt ?? 0);
  }

  async countAptUserCommentsByApt(aptId: string): Promise<number> {
    const row = await this.db
      .prepare(`SELECT COUNT(*) AS cnt FROM apt_user_comments WHERE apt_id = ? AND is_hidden = 0`)
      .bind(aptId)
      .first<{ cnt: number }>();
    return Number(row?.cnt ?? 0);
  }

  async hasUserReportedComment(commentId: string, userId: string): Promise<boolean> {
    const row = await this.db
      .prepare(`SELECT id FROM apt_user_comment_reports WHERE comment_id = ? AND user_id = ? LIMIT 1`)
      .bind(commentId, userId)
      .first();
    return !!row;
  }

  async insertAptCommentReport(payload: { id: string; commentId: string; userId: string; reason: string }): Promise<void> {
    await this.db
      .prepare(`INSERT INTO apt_user_comment_reports (id, comment_id, user_id, reason) VALUES (?, ?, ?, ?)`)
      .bind(payload.id, payload.commentId, payload.userId, payload.reason)
      .run();
    await this.db
      .prepare(`UPDATE apt_user_comments SET report_count = report_count + 1, is_hidden = CASE WHEN report_count + 1 >= 5 THEN 1 ELSE is_hidden END WHERE id = ?`)
      .bind(payload.commentId)
      .run();
  }

  // ── Ranking ──────────────────────────────────────────────────────────────────

  async getRankingByScore(opts: {
    region?: string;
    scoreCol: string;
    limit: number;
  }): Promise<Array<{
    id: string; name: string; address: string | null;
    sido: string | null; sigungu: string | null;
    s_transport: number | null; s_walk: number | null; s_value: number | null;
    s_childcare: number | null; s_safety: number | null;
    score: number | null;
  }>> {
    const { region, scoreCol, limit } = opts;
    const rc = (col: string) => `COALESCE(NULLIF(a.${col},0), d.${col})`;
    const scaleFactor = `MIN(1.0, MAX(0.7, 0.7 + COALESCE(a.s_scale, 50) / 100.0 * 0.3))`;
    const scoreKeys = ["s_transport", "s_walk", "s_value", "s_childcare", "s_safety"] as const;
    const nullAwareCount = scoreKeys.map(c => `CASE WHEN ${rc(c)} IS NOT NULL THEN 1 ELSE 0 END`).join(" + ");
    const computedOverall = `(${scoreKeys.map(c => rc(c)).join(" + ")}) / NULLIF(${nullAwareCount}, 0)`;
    const scoreExpr = scoreCol === "s_overall"
      ? `COALESCE(a.overall_score_adjusted, ${computedOverall})`
      : scoreCol === "s_childcare"
      ? `${rc(scoreCol)} * ${scaleFactor}`
      : `${rc(scoreCol)}`;

    const where: string[] = [`(${scoreExpr}) IS NOT NULL`];
    const binds: (string | number)[] = [];
    if (region) { where.push("d.sido = ?"); binds.push(region); }
    binds.push(limit);

    const rows = await this.db.prepare(`
      SELECT a.id, a.name, a.address, d.sido, d.sigungu,
        ${rc("s_transport")} AS s_transport,
        ${rc("s_walk")} AS s_walk,
        ${rc("s_value")} AS s_value,
        ${rc("s_childcare")} AS s_childcare,
        ${rc("s_safety")} AS s_safety,
        (${scoreExpr}) AS score
      FROM apt_complexes a
      LEFT JOIN district_scores d ON d.code = a.district_code
      WHERE ${where.join(" AND ")}
      ORDER BY score DESC
      LIMIT ?
    `).bind(...binds).all<{
      id: string; name: string; address: string | null;
      sido: string | null; sigungu: string | null;
      s_transport: number | null; s_walk: number | null; s_value: number | null;
      s_childcare: number | null; s_safety: number | null;
      score: number | null;
    }>();
    return rows.results;
  }

  // ── Trends ───────────────────────────────────────────────────────────────────

  async getTrendHot(limit: number): Promise<BattleRow[]> {
    const rows = await this.db.prepare(
      `SELECT * FROM battles ORDER BY view_count DESC LIMIT ?`
    ).bind(limit).all<BattleRow>();
    return rows.results;
  }

  async getTrendPopular(limit: number): Promise<Array<{ id: string; name: string; address: string | null; battle_count: number }>> {
    const rows = await this.db.prepare(`
      SELECT a.id, a.name, a.address, COUNT(b.id) AS battle_count
      FROM apt_complexes a
      JOIN battles b ON b.apt_a_id = a.id OR b.apt_b_id = a.id
      GROUP BY a.id
      ORDER BY battle_count DESC
      LIMIT ?
    `).bind(limit).all<{ id: string; name: string; address: string | null; battle_count: number }>();
    return rows.results;
  }

  async getTrendRecent(limit: number): Promise<BattleRow[]> {
    const rows = await this.db.prepare(
      `SELECT * FROM battles ORDER BY created_at DESC LIMIT ?`
    ).bind(limit).all<BattleRow>();
    return rows.results;
  }
}

import { supabase } from "./supabase";
import { useEffect, useMemo, useState, useCallback } from "react";

export default function ShiftApp() {
  const year = 2026;
  const month = 1;
  const monthDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const days = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);

  // 16日スタート表示
  const displayStartDay = 16;
  const displayOrder = useMemo(() => {
    const arr = [];
    for (let d = displayStartDay; d <= days; d++) arr.push(d);
    for (let d = 1; d < displayStartDay; d++) arr.push(d);
    return arr;
  }, [days]);

  // ズーム（transformは使わない）
  const zoomKey = useMemo(() => `zoom:${monthDate}`, [monthDate]);
  const [zoom, setZoom] = useState(() => {
    const saved = Number(localStorage.getItem(zoomKey) || "1.0");
    return Math.min(1.2, Math.max(0.3, saved));
  });
  useEffect(() => {
    localStorage.setItem(zoomKey, String(zoom));
  }, [zoom, zoomKey]);

  const ui = useMemo(() => {
    const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
    return {
      nameCol: clamp(Math.round(160 * zoom), 72, 260),
      dayCol: clamp(Math.round(84 * zoom), 34, 160),
      ctlCol: clamp(Math.round(90 * zoom), 44, 180),
      cellH: clamp(Math.round(70 * zoom), 26, 150),
      font: clamp(Math.round(14 * zoom), 9, 20),
      pad: clamp(Math.round(8 * zoom), 2, 16),
      inputFont: clamp(Math.round(14 * zoom), 10, 20),
      smallFont: clamp(Math.round(12 * zoom), 9, 18),
    };
  }, [zoom]);

  const rowCountKey = useMemo(() => `rowCount:${monthDate}`, [monthDate]);

  const makeEmptyRow = useCallback(
    () => ({ name: "", days: Array(days).fill("") }),
    [days]
  );

  const initialRowCount = Math.max(
    5,
    Number(localStorage.getItem(rowCountKey) || "5")
  );

  const [rowCount, setRowCount] = useState(initialRowCount);
  const [rows, setRows] = useState(
    Array(initialRowCount).fill(0).map(() => makeEmptyRow())
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 行数保存＆行追加（詰めない）
  useEffect(() => {
    localStorage.setItem(rowCountKey, String(rowCount));
    setRows((prev) => {
      if (prev.length >= rowCount) return prev;
      const next = [...prev];
      while (next.length < rowCount) next.push(makeEmptyRow());
      return next;
    });
  }, [rowCount, rowCountKey, makeEmptyRow]);

  const loadData = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("schedule")
      .select("row_slot, row_name, day, text")
      .eq("month", monthDate)
      .order("row_slot", { ascending: true })
      .order("day", { ascending: true });

    if (error) {
      alert("読み込みエラー: " + error.message);
      setLoading(false);
      return;
    }

    const maxSlotFromDb =
      (data || []).reduce((m, x) => Math.max(m, x.row_slot || 0), 0) || 0;

    const finalRowCount = Math.max(5, rowCount, maxSlotFromDb);

    const newRows = Array(finalRowCount)
      .fill(0)
      .map(() => makeEmptyRow());

    for (const item of data || []) {
      const slot = item.row_slot || 0;
      if (slot < 1 || slot > finalRowCount) continue;

      const rIndex = slot - 1;
      if (item.row_name != null) newRows[rIndex].name = item.row_name ?? "";

      const dayNum = item.day ?? 0;
      if (dayNum >= 1 && dayNum <= days) {
        newRows[rIndex].days[dayNum - 1] = item.text ?? "";
      }
    }

    setRowCount(finalRowCount);
    setRows(newRows);
    setLoading(false);
  }, [monthDate, rowCount, makeEmptyRow, days]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleNameChange = (i, v) => {
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], name: v };
      return next;
    });
  };

  const handleChange = (r, d, v) => {
    setRows((prev) => {
      const next = [...prev];
      next[r] = { ...next[r] };
      const dayArr = [...next[r].days];
      dayArr[d] = v;
      next[r].days = dayArr;
      return next;
    });
  };

  const addRow = () => setRowCount((c) => c + 1);

  const clearRow = (i) => {
    setRows((prev) => {
      const next = [...prev];
      next[i] = makeEmptyRow();
      return next;
    });
  };

  const updateAll = async () => {
    setSaving(true);

    const del = await supabase.from("schedule").delete().eq("month", monthDate);
    if (del.error) {
      alert("削除でエラー: " + del.error.message);
      setSaving(false);
      return;
    }

    const inserts = [];
    rows.forEach((row, r) => {
      const name = (row.name || "").trim();
      if (!name) return;

      inserts.push({
        month: monthDate,
        row_slot: r + 1,
        row_name: name,
        day: 0,
        text: "",
      });

      row.days.forEach((text, d) => {
        const t = (text || "").trim();
        if (!t) return;

        inserts.push({
          month: monthDate,
          row_slot: r + 1,
          row_name: name,
          day: d + 1,
          text: t,
        });
      });
    });

    if (inserts.length) {
      const ins = await supabase.from("schedule").insert(inserts);
      if (ins.error) {
        alert("登録でエラー: " + ins.error.message);
        setSaving(false);
        return;
      }
    }

    alert("更新しました");
    setSaving(false);
    loadData();
  };

  // ====== 色（背景：全文一致で自動） ======
  const bgColorMap = useMemo(() => {
    const palette = [
      "#E3F2FD",
      "#E8F5E9",
      "#FFF3E0",
      "#F3E5F5",
      "#E0F7FA",
      "#FCE4EC",
      "#F1F8E9",
      "#EDE7F6",
      "#FFF8E1",
      "#ECEFF1",
    ];

    const unique = new Set();
    rows.forEach((row) => {
      row.days.forEach((t) => {
        const s = (t || "").trim();
        if (s) unique.add(s);
      });
    });

    const map = {};
    Array.from(unique).forEach((text, i) => {
      map[text] = palette[i % palette.length];
    });
    return map;
  }, [rows]);

  // ====== 文字色（全文ごとに手動で選択） ======
  const textColorKey = useMemo(() => `textColorMap:${monthDate}`, [monthDate]);

  const [textColorMap, setTextColorMap] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(textColorKey) || "{}");
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem(textColorKey, JSON.stringify(textColorMap));
  }, [textColorMap, textColorKey]);

  // 現在月の「ユニーク全文一覧」
  const uniqueTexts = useMemo(() => {
    const s = new Set();
    rows.forEach((row) =>
      row.days.forEach((t) => {
        const v = (t || "").trim();
        if (v) s.add(v);
      })
    );
    return Array.from(s).sort((a, b) => a.localeCompare(b, "ja"));
  }, [rows]);

  // 選択用のカラーパレット（文字色）
  const textPalette = useMemo(
    () => [
      "#111111",
      "#ffffff",
      "#d32f2f",
      "#c2185b",
      "#7b1fa2",
      "#3949ab",
      "#1976d2",
      "#00838f",
      "#2e7d32",
      "#f57c00",
      "#5d4037",
      "#455a64",
    ],
    []
  );

  const setTextColorForValue = (valueText, color) => {
    const key = (valueText || "").trim();
    if (!key) return;
    setTextColorMap((prev) => ({ ...prev, [key]: color }));
  };

  const clearTextColorForValue = (valueText) => {
    const key = (valueText || "").trim();
    if (!key) return;
    setTextColorMap((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const zoomPct = Math.round(zoom * 100);
  const cellBorder = "1px solid #000";

  return (
    <div style={{ padding: 12 }}>
      <h2>
        {year}年 {month}月（16日スタート）
      </h2>

      <div style={{ marginBottom: 10 }}>
        <button onClick={updateAll} disabled={loading || saving}>
          更新
        </button>
        <button
          onClick={addRow}
          disabled={loading || saving}
          style={{ marginLeft: 8 }}
        >
          ＋行追加
        </button>

        <span style={{ marginLeft: 20 }}>表示倍率 {zoomPct}%</span>
        <input
          type="range"
          min="0.3"
          max="1.2"
          step="0.05"
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
        />
      </div>

      {/* ====== 文字色パレット設定UI ====== */}
      <div
        style={{
          border: "1px solid #ccc",
          padding: 10,
          borderRadius: 8,
          marginBottom: 10,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>
          文字色設定（全文ごと）
        </div>
        <div style={{ fontSize: ui.smallFont, color: "#444", marginBottom: 8 }}>
          セルに入っている「全文」単位で文字色を固定できます（この月だけ保存）
        </div>

        {uniqueTexts.length === 0 ? (
          <div style={{ fontSize: ui.smallFont, color: "#666" }}>
            まだ入力がありません
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {uniqueTexts.map((t) => {
              const fg = textColorMap[t] || "#111111";
              const bg = bgColorMap[t] || "transparent";

              return (
                <div
                  key={t}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    alignItems: "center",
                    gap: 10,
                    padding: 8,
                    border: "1px solid #ddd",
                    borderRadius: 8,
                  }}
                >
                  {/* プレビュー */}
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div
                      style={{
                        padding: "6px 10px",
                        border: "1px solid #000",
                        background: bg,
                        color: fg,
                        fontWeight: 700,
                        borderRadius: 6,
                        maxWidth: 420,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={t}
                    >
                      {t}
                    </div>

                    <div style={{ fontSize: ui.smallFont, color: "#444" }}>
                      現在：{fg}
                    </div>
                  </div>

                  {/* パレット */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {textPalette.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setTextColorForValue(t, c)}
                        title={c}
                        style={{
                          width: 22,
                          height: 22,
                          padding: 0,
                          borderRadius: 6,
                          border: "1px solid #000",
                          background: c,
                          cursor: "pointer",
                          outline: c === fg ? "3px solid #1976d2" : "none",
                        }}
                      />
                    ))}

                    {/* 任意色（カラーピッカー） */}
                    <input
                      type="color"
                      value={fg}
                      onChange={(e) => setTextColorForValue(t, e.target.value)}
                      title="任意の色"
                      style={{ width: 34, height: 26, border: "none", background: "transparent" }}
                    />

                    <button
                      type="button"
                      onClick={() => clearTextColorForValue(t)}
                      style={{
                        padding: "6px 10px",
                        border: "1px solid #000",
                        background: "#fff",
                        borderRadius: 8,
                        cursor: "pointer",
                      }}
                      title="文字色を初期（黒）に戻す"
                    >
                      リセット
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ====== 表 ====== */}
      {loading ? (
        <div>読み込み中...</div>
      ) : (
        <div
          style={{
            overflow: "auto",
            maxHeight: "70vh",
            border: "2px solid #000",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <table
            style={{
              borderCollapse: "separate",
              borderSpacing: 0,
              width: "max-content",
              minWidth: "100%",
              fontSize: ui.font,
              background: "#fff",
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    position: "sticky",
                    top: 0,
                    left: 0,
                    zIndex: 60,
                    background: "#f1f3f5",
                    width: ui.nameCol,
                    minWidth: ui.nameCol,
                    border: cellBorder,
                    textAlign: "center",
                  }}
                >
                  名前
                </th>

                {displayOrder.map((day) => (
                  <th
                    key={day}
                    style={{
                      position: "sticky",
                      top: 0,
                      zIndex: 20,
                      background: "#f1f3f5",
                      width: ui.dayCol,
                      minWidth: ui.dayCol,
                      border: cellBorder,
                      textAlign: "center",
                    }}
                  >
                    {day}
                  </th>
                ))}

                <th
                  style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 20,
                    background: "#f1f3f5",
                    width: ui.ctlCol,
                    minWidth: ui.ctlCol,
                    border: cellBorder,
                    textAlign: "center",
                  }}
                >
                  操作
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row, rIndex) => (
                <tr key={rIndex}>
                  <td
                    style={{
                      position: "sticky",
                      left: 0,
                      zIndex: 40,
                      background: "#fff",
                      width: ui.nameCol,
                      minWidth: ui.nameCol,
                      border: cellBorder,
                    }}
                  >
                    <input
                      value={row.name}
                      onChange={(e) => handleNameChange(rIndex, e.target.value)}
                      style={{
                        width: "100%",
                        padding: ui.pad,
                        fontSize: ui.inputFont,
                        border: "none",
                        outline: "none",
                        background: "transparent",
                      }}
                    />
                  </td>

                  {displayOrder.map((day) => {
                    const realIndex = day - 1;
                    const value = row.days[realIndex] || "";
                    const key = value.trim();
                    const bg = bgColorMap[key] || "transparent";
                    const fg = textColorMap[key] || "#111111";

                    return (
                      <td
                        key={day}
                        style={{
                          width: ui.dayCol,
                          minWidth: ui.dayCol,
                          border: cellBorder,
                          background: bg,
                        }}
                      >
                        <textarea
                          value={value}
                          onChange={(e) => handleChange(rIndex, realIndex, e.target.value)}
                          style={{
                            width: "100%",
                            height: ui.cellH,
                            padding: ui.pad,
                            fontSize: ui.inputFont,
                            border: "none",
                            outline: "none",
                            resize: "none",
                            background: "transparent",
                            color: fg,           // ★ここが「文字色」
                            fontWeight: 700,
                          }}
                        />
                      </td>
                    );
                  })}

                  <td
                    style={{
                      width: ui.ctlCol,
                      minWidth: ui.ctlCol,
                      border: cellBorder,
                      background: "#fff",
                    }}
                  >
                    <button onClick={() => clearRow(rIndex)}>行クリア</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
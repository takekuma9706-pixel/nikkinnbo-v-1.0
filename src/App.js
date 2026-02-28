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

  // 行数
  const rowCountKey = useMemo(() => `rowCount:${monthDate}`, [monthDate]);

  // ✅ 現在選択中の文字色（パレット）
  const [currentTextColor, setCurrentTextColor] = useState("#000000");
  // ✅ どのセルを操作中か（パレットクリックでそのセルに適用する）
  const [activeCell, setActiveCell] = useState(null); // { r:number, d:number } | null

  const makeEmptyRow = useCallback(
    () => ({
      name: "",
      days: Array(days).fill(0).map(() => ({ text: "", color: "" })), // ← セルごとに text/color
    }),
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

  // Supabase load（text_colorも読む）
  const loadData = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("schedule")
      .select("row_slot, row_name, day, text, text_color")
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
        const dIndex = dayNum - 1;
        newRows[rIndex].days[dIndex] = {
          text: item.text ?? "",
          color: item.text_color ?? "", // ← DBから復元
        };
      }
    }

    // undefined対策（空セルもオブジェクトに）
    for (let r = 0; r < newRows.length; r++) {
      for (let d = 0; d < days; d++) {
        if (!newRows[r].days[d]) newRows[r].days[d] = { text: "", color: "" };
      }
    }

    setRowCount(finalRowCount);
    setRows(newRows);
    setLoading(false);
  }, [monthDate, rowCount, makeEmptyRow, days]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 入力ハンドラ
  const handleNameChange = (i, v) => {
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], name: v };
      return next;
    });
  };

  // ✅ セル文字を変える（色が未設定なら currentTextColor を自動適用）
  const handleCellTextChange = (r, d, v) => {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[r] };
      const dayArr = [...row.days];
      const cell = { ...(dayArr[d] || { text: "", color: "" }) };

      cell.text = v;

      // 初回入力のタイミングで色を付ける（空→入力）
      if (!cell.color && v.trim()) {
        cell.color = currentTextColor;
      }

      dayArr[d] = cell;
      row.days = dayArr;
      next[r] = row;
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

  // ✅ パレットクリック：現在色を変える＆アクティブセルがあればそのセルに即適用
  const applyPaletteColor = (color) => {
    setCurrentTextColor(color);

    if (!activeCell) return;
    const { r, d } = activeCell;

    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[r] };
      const dayArr = [...row.days];
      const cell = { ...(dayArr[d] || { text: "", color: "" }) };
      cell.color = color;
      dayArr[d] = cell;
      row.days = dayArr;
      next[r] = row;
      return next;
    });
  };

  // 更新（Supabaseへ text_color も保存）
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

      // day=0 は「行の存在」用（色は不要）
      inserts.push({
        month: monthDate,
        row_slot: r + 1,
        row_name: name,
        day: 0,
        text: "",
        text_color: null,
      });

      row.days.forEach((cell, d) => {
        const t = (cell?.text || "").trim();
        if (!t) return;

        inserts.push({
          month: monthDate,
          row_slot: r + 1,
          row_name: name,
          day: d + 1,
          text: t,
          text_color: cell?.color || null, // ← 保存
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

  // 背景色：全文一致で自動（文字色とは別）
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
      row.days.forEach((cell) => {
        const s = (cell?.text || "").trim();
        if (s) unique.add(s);
      });
    });

    const map = {};
    Array.from(unique).forEach((text, i) => {
      map[text] = palette[i % palette.length];
    });
    return map;
  }, [rows]);

  // Excelっぽい文字色パレット
  const textPalette = useMemo(
    () => [
      "#000000",
      "#1F1F1F",
      "#7F7F7F",
      "#D9D9D9",
      "#FFFFFF",
      "#C00000",
      "#FF0000",
      "#FFC000",
      "#FFFF00",
      "#92D050",
      "#00B050",
      "#00B0F0",
      "#0070C0",
      "#002060",
      "#7030A0",
      "#9BBB59",
      "#4F81BD",
      "#F79646",
      "#8064A2",
      "#948A54",
    ],
    []
  );

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

      {/* 文字色パレット */}
      <div
        style={{
          border: "1px solid #ccc",
          padding: 10,
          borderRadius: 8,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontWeight: 700 }}>文字色</div>
          <div style={{ fontSize: ui.smallFont, color: "#444" }}>
            先に色を選ぶ → 入力/選択したセルはその色（端末が変わっても共有：更新ボタンで保存）
          </div>

          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: ui.smallFont, color: "#444" }}>
              選択中
            </span>
            <span
              style={{
                display: "inline-block",
                width: 20,
                height: 20,
                borderRadius: 6,
                border: "1px solid #000",
                background: currentTextColor,
              }}
              title={currentTextColor}
            />
            <input
              type="color"
              value={currentTextColor}
              onChange={(e) => applyPaletteColor(e.target.value)}
              title="任意の色"
              style={{
                width: 40,
                height: 26,
                border: "none",
                background: "transparent",
              }}
            />
          </div>
        </div>

        <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
          {textPalette.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => applyPaletteColor(c)}
              title={c}
              style={{
                width: 26,
                height: 26,
                padding: 0,
                borderRadius: 6,
                border: "1px solid #000",
                background: c,
                cursor: "pointer",
                outline:
                  currentTextColor === c ? "3px solid #1976d2" : "none",
              }}
            />
          ))}
        </div>
      </div>

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
                      placeholder="例：かぼちゃ"
                    />
                  </td>

                  {displayOrder.map((day) => {
                    const dIndex = day - 1;
                    const cell = row.days[dIndex] || { text: "", color: "" };
                    const value = cell.text || "";
                    const bg = bgColorMap[value.trim()] || "transparent";
                    const fg = cell.color || "#000000";

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
                          onChange={(e) =>
                            handleCellTextChange(rIndex, dIndex, e.target.value)
                          }
                          onFocus={() => setActiveCell({ r: rIndex, d: dIndex })}
                          style={{
                            width: "100%",
                            height: ui.cellH,
                            padding: ui.pad,
                            fontSize: ui.inputFont,
                            border: "none",
                            outline: "none",
                            resize: "none",
                            background: "transparent",
                            color: fg,
                            fontWeight: 700,
                            textShadow:
                              fg.toUpperCase() === "#FFFFFF"
                                ? "0 0 2px rgba(0,0,0,0.6)"
                                : "none",
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
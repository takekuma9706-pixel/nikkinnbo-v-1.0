import { supabase } from "./supabase";
import { useEffect, useMemo, useState } from "react";

export default function ShiftApp() {
  const year = 2026;
  const month = 1;
  const monthDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const days = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);

  const displayStartDay = 16;
  const displayOrder = useMemo(() => {
    const arr = [];
    for (let d = displayStartDay; d <= days; d++) arr.push(d);
    for (let d = 1; d < displayStartDay; d++) arr.push(d);
    return arr;
  }, [days]);

  // ===== ズーム（※transform scaleはstickyと相性が悪いので使わない）=====
  const zoomKey = `zoom:${monthDate}`;
  const [zoom, setZoom] = useState(() => {
    const saved = Number(localStorage.getItem(zoomKey) || "0.85");
    return Math.min(1.2, Math.max(0.6, saved));
  });

  useEffect(() => {
    localStorage.setItem(zoomKey, String(zoom));
  }, [zoom, zoomKey]);

  // ズームは「セル幅/文字サイズ」で表現（スマホstickyが安定）
  const ui = useMemo(() => {
    const baseCell = 50;
    const baseFont = 14;
    const baseName = 120;

    return {
      cellMinWidth: Math.round(baseCell * zoom),
      fontSize: Math.round(baseFont * zoom),
      nameColWidth: Math.round(baseName * zoom),
      inputFontSize: Math.round(13 * zoom),
      paddingY: Math.max(2, Math.round(4 * zoom)),
      paddingX: Math.max(3, Math.round(6 * zoom)),
    };
  }, [zoom]);

  // ===== 行数 =====
  const initialRowCount = 20;
  const makeEmptyRow = () => ({ name: "", days: Array(days).fill("") });

  const [rows, setRows] = useState(
    Array(initialRowCount)
      .fill(0)
      .map(() => makeEmptyRow())
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedCells, setExpandedCells] = useState({});
  const [query, setQuery] = useState("");

  useEffect(() => {
    loadData();
    // eslint-disable-next-line
  }, []);

  const loadData = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("schedule")
      .select("row_slot, row_name, day, text")
      .eq("month", monthDate)
      .order("row_slot", { ascending: true });

    if (error) {
      console.error(error);
      alert("読み込み失敗");
      setLoading(false);
      return;
    }

    const newRows = Array(initialRowCount)
      .fill(0)
      .map(() => makeEmptyRow());

    for (const item of data || []) {
      const r = (item.row_slot || 1) - 1;
      if (!newRows[r]) continue;
      newRows[r].name = item.row_name || "";
      if (item.day > 0) newRows[r].days[item.day - 1] = item.text || "";
    }

    setRows(newRows);
    setExpandedCells({});
    setLoading(false);
  };

  // ===== 色分け =====
  const colorPalette = [
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

  // 「短縮表示の1文字」単位で色固定
  const textColorMap = useMemo(() => {
    const uniqueKeys = new Set();
    rows.forEach((row) => {
      row.days.forEach((text) => {
        const t = (text || "").trim();
        if (!t) return;
        uniqueKeys.add(t.charAt(0));
      });
    });

    const map = {};
    Array.from(uniqueKeys).forEach((key, index) => {
      map[key] = colorPalette[index % colorPalette.length];
    });
    return map;
  }, [rows]);

  const handleChange = (r, d, val) => {
    setRows((prev) => {
      const next = [...prev];
      next[r] = { ...next[r], days: [...next[r].days] };
      next[r].days[d] = val;
      return next;
    });
  };

  const handleNameChange = (r, val) => {
    setRows((prev) => {
      const next = [...prev];
      next[r] = { ...next[r], name: val };
      return next;
    });
  };

  const toggleExpand = (key) => {
    setExpandedCells((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const editCell = (rIndex, realIndex, currentValue) => {
    const next = window.prompt("入力", currentValue ?? "");
    if (next === null) return;
    handleChange(rIndex, realIndex, next);
  };

  const updateAll = async () => {
    setSaving(true);

    const del = await supabase.from("schedule").delete().eq("month", monthDate);
    if (del.error) {
      console.error(del.error);
      alert("更新に失敗しました（削除）");
      setSaving(false);
      return;
    }

    const inserts = [];
    rows.forEach((row, rIndex) => {
      if (!row.name.trim()) return;

      inserts.push({
        month: monthDate,
        row_slot: rIndex + 1,
        row_name: row.name,
        day: 0,
        text: "",
      });

      row.days.forEach((text, dIndex) => {
        const t = (text || "").trim();
        if (!t) return;
        inserts.push({
          month: monthDate,
          row_slot: rIndex + 1,
          row_name: row.name,
          day: dIndex + 1,
          text: t,
        });
      });
    });

    if (inserts.length) {
      const ins = await supabase.from("schedule").insert(inserts);
      if (ins.error) {
        console.error(ins.error);
        alert("更新に失敗しました（保存）");
        setSaving(false);
        return;
      }
    }

    alert("更新しました");
    setSaving(false);
  };

  // ★ 検索してもindexズレない
  const rowsWithIndex = useMemo(
    () => rows.map((row, index) => ({ row, index })),
    [rows]
  );

  const filteredRows = useMemo(() => {
    if (!query) return rowsWithIndex;
    return rowsWithIndex.filter(({ row }) => row.name.includes(query));
  }, [rowsWithIndex, query]);

  const zoomPct = Math.round(zoom * 100);

  // 固定ヘッダー色（少し濃い）
  const headerBg = "#f1f3f5";

  return (
    <div style={{ padding: 12 }}>
      <h2>
        {year}年 {month}月（16日スタート）
      </h2>

      <div style={{ marginBottom: 10 }}>
        <button onClick={updateAll} disabled={saving}>
          更新
        </button>

        <input
          style={{ marginLeft: 10 }}
          placeholder="名前検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <span style={{ marginLeft: 15 }}>表示倍率 {zoomPct}%</span>
        <input
          type="range"
          min="0.6"
          max="1.2"
          step="0.05"
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
        />
      </div>

      {loading ? (
        <div>読み込み中...</div>
      ) : (
        <div
          style={{
            overflow: "auto",
            maxHeight: "80vh",
            WebkitOverflowScrolling: "touch", // iOSでスクロールを滑らかに
            border: "1px solid #ddd",
          }}
        >
          <table
            border="1"
            style={{
              borderCollapse: "separate", // sticky安定のため（collapseだとiOSで崩れることあり）
              borderSpacing: 0,
              fontSize: ui.fontSize,
            }}
          >
            <thead>
              <tr>
                {/* 左上（名前ヘッダー） */}
                <th
                  style={{
                    position: "sticky",
                    top: 0,
                    left: 0,
                    background: headerBg,
                    zIndex: 5,
                    fontWeight: "bold",
                    minWidth: ui.nameColWidth,
                    padding: `${ui.paddingY}px ${ui.paddingX}px`,
                  }}
                >
                  名前
                </th>

                {/* 日付ヘッダー */}
                {displayOrder.map((d) => (
                  <th
                    key={d}
                    style={{
                      position: "sticky",
                      top: 0,
                      background: headerBg,
                      zIndex: 4,
                      fontWeight: "bold",
                      minWidth: ui.cellMinWidth,
                      textAlign: "center",
                      padding: `${ui.paddingY}px ${ui.paddingX}px`,
                    }}
                  >
                    {d}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredRows.map(({ row, index: rIndex }) => (
                <tr key={rIndex}>
                  {/* 名前列（左固定） */}
                  <td
                    style={{
                      position: "sticky",
                      left: 0,
                      background: "#fff",
                      zIndex: 3,
                      minWidth: ui.nameColWidth,
                      padding: `${ui.paddingY}px ${ui.paddingX}px`,
                    }}
                  >
                    <input
                      value={row.name}
                      onChange={(e) => handleNameChange(rIndex, e.target.value)}
                      style={{
                        width: "100%",
                        fontSize: ui.inputFontSize,
                        boxSizing: "border-box",
                      }}
                    />
                  </td>

                  {displayOrder.map((day) => {
                    const realIndex = day - 1;
                    const value = row.days[realIndex] || "";

                    const keyChar = value.trim() ? value.trim().charAt(0) : "";
                    const bg = keyChar ? textColorMap[keyChar] : "#fff";
                    const shortText = keyChar;

                    const cellKey = `${rIndex}-${realIndex}`;
                    const expanded = !!expandedCells[cellKey];

                    return (
                      <td
                        key={day}
                        style={{
                          background: bg,
                          textAlign: "center",
                          cursor: "pointer",
                          fontWeight: "bold",
                          minWidth: ui.cellMinWidth,
                          padding: `${ui.paddingY}px ${ui.paddingX}px`,
                          userSelect: "none",
                        }}
                        onClick={() => toggleExpand(cellKey)}
                        onDoubleClick={() => editCell(rIndex, realIndex, value)}
                        title="クリック: 展開 / ダブルクリック: 編集"
                      >
                        {expanded ? value : shortText}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
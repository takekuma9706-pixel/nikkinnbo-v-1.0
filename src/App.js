import { supabase } from "./supabase";
import { useEffect, useMemo, useRef, useState } from "react";

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

  // ===== ズーム（transformは使わず、サイズで表現）=====
  const zoomKey = `zoom:${monthDate}`;
  const [zoom, setZoom] = useState(() => {
    const saved = Number(localStorage.getItem(zoomKey) || "0.85");
    return Math.min(1.2, Math.max(0.6, saved));
  });
  useEffect(() => {
    localStorage.setItem(zoomKey, String(zoom));
  }, [zoom, zoomKey]);

  const ui = useMemo(() => {
    const baseCell = 52;
    const baseFont = 14;
    const baseName = 140;

    return {
      cellW: Math.round(baseCell * zoom),
      fontSize: Math.round(baseFont * zoom),
      nameW: Math.round(baseName * zoom),
      inputFont: Math.round(13 * zoom),
      padY: Math.max(3, Math.round(6 * zoom)),
      padX: Math.max(4, Math.round(8 * zoom)),
      rowH: Math.max(30, Math.round(36 * zoom)),
      headerBg: "#f1f3f5",
    };
  }, [zoom]);

  // ===== 行データ =====
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

  // ===== 色分け（短縮表示の1文字単位）=====
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

  const textColorMap = useMemo(() => {
    const keys = new Set();
    rows.forEach((row) => {
      row.days.forEach((text) => {
        const t = (text || "").trim();
        if (!t) return;
        keys.add(t.charAt(0));
      });
    });
    const map = {};
    Array.from(keys).forEach((k, i) => (map[k] = colorPalette[i % colorPalette.length]));
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
    setExpandedCells((prev) => ({ ...prev, [key]: !prev[key] }));
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

  // ★ フィルタしてもindexズレない
  const rowsWithIndex = useMemo(() => rows.map((row, index) => ({ row, index })), [rows]);
  const filteredRows = useMemo(() => {
    if (!query) return rowsWithIndex;
    return rowsWithIndex.filter(({ row }) => row.name.includes(query));
  }, [rowsWithIndex, query]);

  // ===== スクロール同期（stickyに頼らない）=====
  const headerRef = useRef(null); // 横スクロール用ヘッダー
  const leftRef = useRef(null);   // 縦スクロール用名前列
  const bodyRef = useRef(null);   // 本体（縦横スクロール）

  const syncing = useRef(false);

  const onBodyScroll = () => {
    if (syncing.current) return;
    syncing.current = true;
    requestAnimationFrame(() => {
      const body = bodyRef.current;
      const header = headerRef.current;
      const left = leftRef.current;
      if (body && header) header.scrollLeft = body.scrollLeft;
      if (body && left) left.scrollTop = body.scrollTop;
      syncing.current = false;
    });
  };

  const onHeaderScroll = () => {
    if (syncing.current) return;
    syncing.current = true;
    requestAnimationFrame(() => {
      const body = bodyRef.current;
      const header = headerRef.current;
      if (body && header) body.scrollLeft = header.scrollLeft;
      syncing.current = false;
    });
  };

  const onLeftScroll = () => {
    if (syncing.current) return;
    syncing.current = true;
    requestAnimationFrame(() => {
      const body = bodyRef.current;
      const left = leftRef.current;
      if (body && left) body.scrollTop = left.scrollTop;
      syncing.current = false;
    });
  };

  const zoomPct = Math.round(zoom * 100);

  // 共通セルstyle
  const cellBase = {
    width: ui.cellW,
    minWidth: ui.cellW,
    height: ui.rowH,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
    boxSizing: "border-box",
    borderRight: "1px solid #ddd",
    borderBottom: "1px solid #ddd",
    padding: `${ui.padY}px ${ui.padX}px`,
    userSelect: "none",
  };

  const nameCellBase = {
    width: ui.nameW,
    minWidth: ui.nameW,
    height: ui.rowH,
    display: "flex",
    alignItems: "center",
    boxSizing: "border-box",
    borderRight: "1px solid #ddd",
    borderBottom: "1px solid #ddd",
    padding: `${ui.padY}px ${ui.padX}px`,
    background: "#fff",
  };

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
            border: "1px solid #ddd",
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          {/* 2x2レイアウト：
              [左上] [上ヘッダー]
              [左列] [本体]
          */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `${ui.nameW}px 1fr`,
              gridTemplateRows: `${ui.rowH}px 70vh`,
              width: "100%",
            }}
          >
            {/* 左上（固定コーナー） */}
            <div
              style={{
                background: ui.headerBg,
                borderRight: "1px solid #ddd",
                borderBottom: "1px solid #ddd",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "bold",
                fontSize: ui.fontSize,
              }}
            >
              名前
            </div>

            {/* 上ヘッダー（横スクロールだけ） */}
            <div
              ref={headerRef}
              onScroll={onHeaderScroll}
              style={{
                overflowX: "auto",
                overflowY: "hidden",
                WebkitOverflowScrolling: "touch",
                background: ui.headerBg,
                borderBottom: "1px solid #ddd",
              }}
            >
              <div style={{ display: "flex", width: ui.cellW * displayOrder.length }}>
                {displayOrder.map((d) => (
                  <div
                    key={d}
                    style={{
                      ...cellBase,
                      background: ui.headerBg,
                      fontSize: ui.fontSize,
                      borderTop: "0",
                    }}
                  >
                    {d}
                  </div>
                ))}
              </div>
            </div>

            {/* 左列（縦スクロールだけ） */}
            <div
              ref={leftRef}
              onScroll={onLeftScroll}
              style={{
                overflowY: "auto",
                overflowX: "hidden",
                WebkitOverflowScrolling: "touch",
                background: "#fff",
                borderRight: "1px solid #ddd",
              }}
            >
              <div>
                {filteredRows.map(({ row, index: rIndex }) => (
                  <div key={rIndex} style={{ ...nameCellBase }}>
                    <input
                      value={row.name}
                      onChange={(e) => handleNameChange(rIndex, e.target.value)}
                      style={{
                        width: "100%",
                        fontSize: ui.inputFont,
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* 本体（縦横スクロール） */}
            <div
              ref={bodyRef}
              onScroll={onBodyScroll}
              style={{
                overflow: "auto",
                WebkitOverflowScrolling: "touch",
                background: "#fff",
              }}
            >
              <div style={{ width: ui.cellW * displayOrder.length }}>
                {filteredRows.map(({ row, index: rIndex }) => (
                  <div key={rIndex} style={{ display: "flex" }}>
                    {displayOrder.map((day) => {
                      const realIndex = day - 1;
                      const value = row.days[realIndex] || "";

                      const keyChar = value.trim() ? value.trim().charAt(0) : "";
                      const bg = keyChar ? textColorMap[keyChar] : "#fff";
                      const shortText = keyChar;

                      const cellKey = `${rIndex}-${realIndex}`;
                      const expanded = !!expandedCells[cellKey];

                      return (
                        <div
                          key={day}
                          style={{
                            ...cellBase,
                            background: bg,
                            fontSize: ui.fontSize,
                            cursor: "pointer",
                          }}
                          onClick={() => toggleExpand(cellKey)}
                          onDoubleClick={() => editCell(rIndex, realIndex, value)}
                          title="クリック: 展開 / ダブルクリック: 編集"
                        >
                          {expanded ? value : shortText}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
import { supabase } from "./supabase";
import { useEffect, useMemo, useState } from "react";

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

  // ズーム（0.3〜1.2）
  const zoomKey = `zoom:${monthDate}`;
  const [zoom, setZoom] = useState(() => {
    const saved = Number(localStorage.getItem(zoomKey) || "1.0");
    return Math.min(1.2, Math.max(0.3, saved));
  });
  useEffect(() => {
    localStorage.setItem(zoomKey, String(zoom));
  }, [zoom, zoomKey]);

  // UIサイズ計算
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
    };
  }, [zoom]);

  const rowCountKey = `rowCount:${monthDate}`;
  const initialRowCount = Math.max(
    5,
    Number(localStorage.getItem(rowCountKey) || "5")
  );

  const makeEmptyRow = () => ({ name: "", days: Array(days).fill("") });

  const [rowCount, setRowCount] = useState(initialRowCount);
  const [rows, setRows] = useState(
    Array(initialRowCount)
      .fill(0)
      .map(() => makeEmptyRow())
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    localStorage.setItem(rowCountKey, String(rowCount));
    setRows((prev) => {
      if (prev.length >= rowCount) return prev;
      const next = [...prev];
      while (next.length < rowCount) next.push(makeEmptyRow());
      return next;
    });
  }, [rowCount]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);

    const { data } = await supabase
      .from("schedule")
      .select("row_slot, row_name, day, text")
      .eq("month", monthDate)
      .order("row_slot", { ascending: true })
      .order("day", { ascending: true });

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

      if (item.day >= 1 && item.day <= days) {
        newRows[rIndex].days[item.day - 1] = item.text ?? "";
      }
    }

    setRowCount(finalRowCount);
    setRows(newRows);
    setLoading(false);
  };

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
    await supabase.from("schedule").delete().eq("month", monthDate);

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

    if (inserts.length) await supabase.from("schedule").insert(inserts);

    alert("更新しました");
    setSaving(false);
    await loadData();
  };

  // 全文一致で色固定
  const textColorMap = useMemo(() => {
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

    const uniqueTexts = new Set();
    rows.forEach((row) => {
      row.days.forEach((t) => {
        const s = (t || "").trim();
        if (s) uniqueTexts.add(s);
      });
    });

    const map = {};
    Array.from(uniqueTexts).forEach((text, i) => {
      map[text] = palette[i % palette.length];
    });

    return map;
  }, [rows]);

  const zoomPct = Math.round(zoom * 100);

  return (
    <div style={{ padding: 12 }}>
      <h2>{year}年 {month}月（16日スタート）</h2>

      <div style={{ marginBottom: 10 }}>
        <button onClick={updateAll} disabled={saving}>更新</button>
        <button onClick={addRow} disabled={saving} style={{ marginLeft: 8 }}>
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

      {loading ? (
        <div>読み込み中...</div>
      ) : (
        <div
          style={{
            overflow: "auto",
            maxHeight: "70vh",
            border: "2px solid #000",
          }}
        >
          <table
            style={{
              borderCollapse: "separate",
              borderSpacing: 0,
              width: "max-content",
              minWidth: "100%",
              fontSize: ui.font,
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
                    border: "1px solid #000",
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
                      border: "1px solid #000",
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
                    border: "1px solid #000",
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
                      background: "#fff",
                      zIndex: 40,
                      width: ui.nameCol,
                      border: "1px solid #000",
                    }}
                  >
                    <input
                      value={row.name}
                      onChange={(e) =>
                        handleNameChange(rIndex, e.target.value)
                      }
                      style={{
                        width: "100%",
                        padding: ui.pad,
                        fontSize: ui.inputFont,
                        border: "none",
                        outline: "none",
                      }}
                    />
                  </td>

                  {displayOrder.map((day) => {
                    const realIndex = day - 1;
                    const value = row.days[realIndex] || "";
                    const bg = textColorMap[value?.trim()] || "transparent";

                    return (
                      <td
                        key={day}
                        style={{
                          width: ui.dayCol,
                          border: "1px solid #000",
                          background: bg,
                        }}
                      >
                        <textarea
                          value={value}
                          onChange={(e) =>
                            handleChange(rIndex, realIndex, e.target.value)
                          }
                          style={{
                            width: "100%",
                            height: ui.cellH,
                            padding: ui.pad,
                            fontSize: ui.inputFont,
                            border: "none",
                            outline: "none",
                            resize: "none",
                            background: "transparent",
                          }}
                        />
                      </td>
                    );
                  })}

                  <td style={{ border: "1px solid #000", width: ui.ctlCol }}>
                    <button onClick={() => clearRow(rIndex)}>
                      行クリア
                    </button>
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
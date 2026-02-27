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

  // ===== ズーム =====
  const zoomKey = `zoom:${monthDate}`;
  const [zoom, setZoom] = useState(() => {
    const saved = Number(localStorage.getItem(zoomKey) || "0.65");
    return Math.min(1.2, Math.max(0.35, saved));
  });

  useEffect(() => {
    localStorage.setItem(zoomKey, String(zoom));
  }, [zoom, zoomKey]);

  // ===== 行数 =====
  const initialRowCount = 20;
  const makeEmptyRow = () => ({ name: "", days: Array(days).fill("") });

  const [rows, setRows] = useState(
    Array(initialRowCount).fill(0).map(() => makeEmptyRow())
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedCells, setExpandedCells] = useState({});
  const [query, setQuery] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);

    const { data } = await supabase
      .from("schedule")
      .select("row_slot, row_name, day, text")
      .eq("month", monthDate)
      .order("row_slot", { ascending: true });

    const newRows = Array(initialRowCount)
      .fill(0)
      .map(() => makeEmptyRow());

    for (const item of data || []) {
      const r = (item.row_slot || 1) - 1;
      if (!newRows[r]) continue;
      newRows[r].name = item.row_name || "";
      if (item.day > 0)
        newRows[r].days[item.day - 1] = item.text || "";
    }

    setRows(newRows);
    setLoading(false);
  };

  // ===== 自動色割り当て =====
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
    "#ECEFF1"
  ];

  const textColorMap = useMemo(() => {
    const uniqueTexts = new Set();

    rows.forEach((row) => {
      row.days.forEach((text) => {
        if (text.trim()) uniqueTexts.add(text.trim());
      });
    });

    const map = {};
    Array.from(uniqueTexts).forEach((text, index) => {
      map[text] = colorPalette[index % colorPalette.length];
    });

    return map;
  }, [rows]);

  const handleChange = (r, d, val) => {
    setRows((prev) => {
      const next = [...prev];
      next[r].days[d] = val;
      return next;
    });
  };

  const handleNameChange = (r, val) => {
    setRows((prev) => {
      const next = [...prev];
      next[r].name = val;
      return next;
    });
  };

  const toggleExpand = (key) => {
    setExpandedCells((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const updateAll = async () => {
    setSaving(true);

    await supabase.from("schedule").delete().eq("month", monthDate);

    const inserts = [];

    rows.forEach((row, rIndex) => {
      if (!row.name.trim()) return;

      inserts.push({
        month: monthDate,
        row_slot: rIndex + 1,
        row_name: row.name,
        day: 0,
        text: ""
      });

      row.days.forEach((text, dIndex) => {
        if (!text.trim()) return;
        inserts.push({
          month: monthDate,
          row_slot: rIndex + 1,
          row_name: row.name,
          day: dIndex + 1,
          text
        });
      });
    });

    if (inserts.length) {
      await supabase.from("schedule").insert(inserts);
    }

    alert("更新しました");
    setSaving(false);
  };

  const filteredRows = rows.filter((r) =>
    r.name.includes(query)
  );

  const zoomPct = Math.round(zoom * 100);

  return (
    <div style={{ padding: 12 }}>
      <h2>{year}年 {month}月（16日スタート）</h2>

      <div style={{ marginBottom: 10 }}>
        <button onClick={updateAll} disabled={saving}>更新</button>
        <input
          style={{ marginLeft: 10 }}
          placeholder="名前検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span style={{ marginLeft: 15 }}>表示倍率 {zoomPct}%</span>
        <input
          type="range"
          min="0.35"
          max="1.2"
          step="0.05"
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
        />
      </div>

      {loading ? (
        <div>読み込み中...</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}>
            <table border="1" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th>名前</th>
                  {displayOrder.map((d) => (
                    <th key={d}>{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, rIndex) => (
                  <tr key={rIndex}>
                    <td>
                      <input
                        value={row.name}
                        onChange={(e) =>
                          handleNameChange(rIndex, e.target.value)
                        }
                      />
                    </td>

                    {displayOrder.map((day) => {
                      const realIndex = day - 1;
                      const value = row.days[realIndex] || "";
                      const bg = textColorMap[value] || "#fff";
                      const shortText = value ? value.charAt(0) : "";

                      const cellKey = `${rIndex}-${realIndex}`;
                      const expanded = expandedCells[cellKey];

                      return (
                        <td
                          key={day}
                          style={{
                            background: bg,
                            textAlign: "center",
                            cursor: "pointer",
                            fontWeight: "bold",
                            minWidth: 50
                          }}
                          onClick={() => toggleExpand(cellKey)}
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
        </div>
      )}
    </div>
  );
}
import { supabase } from "./supabase";
import { useEffect, useMemo, useState } from "react";

export default function ShiftApp() {
  const year = 2026;
  const month = 1;
  const monthDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const days = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);

  // ✅ 表示順：16日スタート（16..月末, 1..15）
  const displayStartDay = 16;
  const displayOrder = useMemo(() => {
    const arr = [];
    for (let d = displayStartDay; d <= days; d++) arr.push(d);
    for (let d = 1; d < displayStartDay; d++) arr.push(d);
    return arr;
  }, [days]);

  // ✅ ズーム（引きで見たい用）
  const zoomKey = `zoom:${monthDate}`;
  const [zoom, setZoom] = useState(() => {
    const saved = Number(localStorage.getItem(zoomKey) || "0.85");
    // 0.6〜1.2に制限
    return Math.min(1.2, Math.max(0.6, saved));
  });
  useEffect(() => {
    localStorage.setItem(zoomKey, String(zoom));
  }, [zoom]);

  // 行数をブラウザに保存（行を空白にしても詰めない）
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

  // rowCount保存 + rowsを増やす（詰めない）
  useEffect(() => {
    localStorage.setItem(rowCountKey, String(rowCount));
    setRows((prev) => {
      if (prev.length >= rowCount) return prev;
      const next = [...prev];
      while (next.length < rowCount) next.push(makeEmptyRow());
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowCount]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
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
  };

  const handleNameChange = (rowIndex, value) => {
    setRows((prev) => {
      const next = [...prev];
      next[rowIndex] = { ...next[rowIndex], name: value };
      return next;
    });
  };

  const handleChange = (rowIndex, realDayIndex, value) => {
    setRows((prev) => {
      const next = [...prev];
      next[rowIndex] = { ...next[rowIndex] };
      const dayArr = [...next[rowIndex].days];
      dayArr[realDayIndex] = value;
      next[rowIndex].days = dayArr;
      return next;
    });
  };

  const addRow = () => setRowCount((c) => c + 1);

  const clearRow = (rowIndex) => {
    setRows((prev) => {
      const next = [...prev];
      next[rowIndex] = makeEmptyRow();
      return next;
    });
  };

  const updateAll = async () => {
    setSaving(true);

    const { error: delError } = await supabase
      .from("schedule")
      .delete()
      .eq("month", monthDate);

    if (delError) {
      alert("削除でエラー: " + delError.message);
      setSaving(false);
      return;
    }

    const inserts = [];
    for (let r = 0; r < rows.length; r++) {
      const name = (rows[r].name || "").trim();
      if (!name) continue;

      inserts.push({
        month: monthDate,
        row_slot: r + 1,
        row_name: name,
        day: 0,
        text: "",
      });

      for (let d = 0; d < rows[r].days.length; d++) {
        const text = (rows[r].days[d] || "").trim();
        if (!text) continue;

        inserts.push({
          month: monthDate,
          row_slot: r + 1,
          row_name: name,
          day: d + 1,
          text,
        });
      }
    }

    if (inserts.length > 0) {
      const { error: insError } = await supabase.from("schedule").insert(inserts);
      if (insError) {
        alert("登録でエラー: " + insError.message);
        setSaving(false);
        return;
      }
    }

    alert("更新しました");
    setSaving(false);
    await loadData();
  };

  const zoomPct = Math.round(zoom * 100);

  return (
    <div className="page">
      <style>{`
        :root{
          --border:#cfcfcf;
          --bg:#ffffff;
          --bg2:#f7f7f7;
          --text:#111;
        }
        * { box-sizing: border-box; }
        body { margin:0; color:var(--text); background:var(--bg); }
        .page { padding: 12px; }

        .topbar {
          position: sticky;
          top: 0;
          z-index: 50;
          background: var(--bg);
          padding: 10px 0 10px 0;
          border-bottom: 1px solid var(--border);
        }
        .titleRow {
          display:flex;
          align-items:center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        h2 { margin: 0; font-size: 18px; }

        .actions {
          display:flex;
          gap: 8px;
          align-items:center;
          flex-wrap: wrap;
        }
        button {
          padding: 10px 12px;
          border: 1px solid var(--border);
          background: var(--bg2);
          border-radius: 10px;
          font-size: 14px;
          cursor: pointer;
        }
        button:disabled { opacity: .6; cursor: not-allowed; }

        .hint {
          font-size: 12px;
          color: #444;
          margin-top: 6px;
          display:flex;
          gap: 10px;
          align-items:center;
          flex-wrap: wrap;
        }

        .zoomBox{
          display:flex;
          gap: 8px;
          align-items:center;
          padding: 6px 10px;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--bg2);
        }
        .zoomLabel{ font-size: 12px; color:#333; white-space:nowrap; }
        .zoomValue{ font-size: 12px; font-weight: 600; width: 44px; text-align:right; }

        .tableWrap {
          margin-top: 10px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--bg);
        }

        /* ✅ ここが「引き（縮小）」の本体：テーブル全体を縮小表示 */
        .zoomStage{
          transform: scale(${zoom});
          transform-origin: top left;
          display: inline-block;
        }

        table {
          border-collapse: collapse;
          width: max-content;
          min-width: 100%;
        }

        th, td {
          border: 1px solid var(--border);
          padding: 0;
          vertical-align: top;
          background: var(--bg);
        }

        thead th {
          position: sticky;
          top: 61px;
          z-index: 20;
          background: var(--bg2);
          font-weight: 600;
        }

        .nameHeader, .nameCell {
          position: sticky;
          left: 0;
          z-index: 30;
          background: var(--bg2);
        }
        .nameCell { background: var(--bg); }

        .nameCol { width: 160px; min-width: 160px; max-width: 160px; }
        .dayCol  { width: 84px; min-width: 84px; }
        .ctlCol  { width: 90px; min-width: 90px; }

        .nameInput {
          width: 100%;
          border: none;
          outline: none;
          padding: 8px;
          font-size: 14px;
          background: transparent;
        }

        .cellArea {
          width: 100%;
          height: 70px;
          border: none;
          outline: none;
          resize: none;
          padding: 8px;
          font-size: 14px;
          background: transparent;
        }

        .ctlBtn {
          width: 100%;
          border: none;
          background: transparent;
          padding: 10px 8px;
          font-size: 13px;
          cursor: pointer;
        }

        .loading { padding: 14px 6px; }

        @media (max-width: 768px) {
          .page { padding: 10px; }
          h2 { font-size: 16px; }
          button { padding: 12px 14px; font-size: 15px; }
          thead th { top: 63px; }
          .nameCol { width: 150px; min-width: 150px; max-width: 150px; }
          .dayCol { width: 84px; min-width: 84px; }
          .cellArea { height: 74px; font-size: 15px; }
          .nameInput { font-size: 15px; }
        }
      `}</style>

      <div className="topbar">
        <div className="titleRow">
          <h2>
            {year}年 {month}月（16日スタート）
          </h2>

          <div className="actions">
            <button onClick={updateAll} disabled={loading || saving}>
              更新
            </button>
            <button onClick={addRow} disabled={loading || saving}>
              ＋行追加
            </button>
          </div>
        </div>

        <div className="hint">
          <span>横スクロールできます。</span>

          <span className="zoomBox">
            <span className="zoomLabel">表示倍率</span>
            <input
              type="range"
              min="0.3"
              max="1.2"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
            <span className="zoomValue">{zoomPct}%</span>
            <button
              type="button"
              onClick={() => setZoom(0.85)}
              style={{ padding: "6px 10px" }}
            >
              既定
            </button>
          </span>
        </div>
      </div>

      {loading ? (
        <div className="loading">読み込み中...</div>
      ) : (
        <div className="tableWrap">
          <div className="zoomStage">
            <table>
              <thead>
                <tr>
                  <th className="nameHeader nameCol">名前</th>
                  {displayOrder.map((day) => (
                    <th key={day} className="dayCol">
                      {day}
                    </th>
                  ))}
                  <th className="ctlCol">操作</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row, rIndex) => (
                  <tr key={rIndex}>
                    <td className="nameCell nameCol">
                      <input
                        className="nameInput"
                        value={row.name}
                        onChange={(e) => handleNameChange(rIndex, e.target.value)}
                        placeholder="例：Aさん / 車輛A"
                      />
                    </td>

                    {displayOrder.map((day) => {
                      const realIndex = day - 1;
                      return (
                        <td key={day} className="dayCol">
                          <textarea
                            className="cellArea"
                            value={row.days[realIndex]}
                            onChange={(e) =>
                              handleChange(rIndex, realIndex, e.target.value)
                            }
                          />
                        </td>
                      );
                    })}

                    <td className="ctlCol">
                      <button className="ctlBtn" onClick={() => clearRow(rIndex)}>
                        行クリア
                      </button>
                    </td>
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
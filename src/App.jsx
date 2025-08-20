
import React, { useEffect, useMemo, useState } from "react";

/**
 * Milk Dairy Tracker (React + Vite + Tailwind)
 * - Calendar to add daily entries (cow/buffalo + kg)
 * - Rates (₹/kg) with future-only updates (effectiveFrom). Past entries keep old rates.
 * - Totals: kg by type, total kg, total ₹ cost (date-correct rates)
 * - Stickers: cow/buffalo in dialogs, stats, entries, and calendar cells
 * - Hover tooltip on calendar days showing breakdown + cost
 * - LocalStorage persistence
 */

const STICKERS = {
  cow: "/stickers/cow.png",
  buffalo: "/stickers/buffalo.png",
};

const MILK_TYPES = [
  { id: "cow", label: "Cow", icon: STICKERS.cow },
  { id: "buffalo", label: "Buffalo", icon: STICKERS.buffalo },
];

const pad = (n) => String(n).padStart(2, "0");
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = () => toKey(new Date());
const parseKey = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const endOfMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);

function daysMatrix(activeDate) {
  const start = startOfMonth(activeDate);
  const end = endOfMonth(activeDate);
  const startIdx = (start.getDay() + 6) % 7; // Monday=0
  const totalDays = startIdx + end.getDate();
  const rows = Math.ceil(totalDays / 7);
  const matrix = [];
  let cursor = new Date(start);
  cursor.setDate(cursor.getDate() - startIdx);
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < 7; c++) {
      row.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    matrix.push(row);
  }
  return matrix;
}

// LocalStorage
const LS_KEYS = { entries: "dairy.entries.v2", rates: "dairy.rates.v2" };
const loadLS = (key, fallback) => {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
};
const saveLS = (key, value) => localStorage.setItem(key, JSON.stringify(value));


//APP Component
export default function App() {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [entries, setEntries] = useState(() => loadLS(LS_KEYS.entries, []));
  const [rates, setRates] = useState(() => loadLS(LS_KEYS.rates, []));

  // Dialogs
  const [showEntryDialog, setShowEntryDialog] = useState(false);
  const [entryDraft, setEntryDraft] = useState({ date: todayKey(), type: "buffalo", kg: "" });

  const [showRateDialog, setShowRateDialog] = useState(false);
  const [rateDraft, setRateDraft] = useState({ effectiveFrom: todayKey(), cow: "", buffalo: "" });

  useEffect(() => saveLS(LS_KEYS.entries, entries), [entries]);
  useEffect(() => saveLS(LS_KEYS.rates, rates), [rates]);

  // Business logic
  const sortedRates = useMemo(
    () => [...rates].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)),
    [rates]
  );
  const latestRate = sortedRates[sortedRates.length - 1];

  function rateForDate(dateKey) {
    let found = null;
    for (const r of sortedRates) {
      if (r.effectiveFrom <= dateKey) found = r; else break;
    }
    return found;
  }

  const monthEntries = useMemo(() => {
    const start = startOfMonth(month), end = endOfMonth(month);
    return entries.filter((e) => {
      const d = parseKey(e.date);
      return d >= start && d <= end;
    });
  }, [entries, month]);

  function addEntry(draft) {
    const clean = { date: draft.date, type: draft.type, kg: Number(draft.kg) };
    if (!clean.date || isNaN(clean.kg) || clean.kg <= 0) return;
    const rf = rateForDate(clean.date);
    if (!rf) { alert("Please set milk rates (effective on or before the entry date) before adding entries."); return; }
    setEntries((cur) => [...cur, clean]);
    setShowEntryDialog(false);
  }

  function addRate(draft) {
    const clean = { effectiveFrom: draft.effectiveFrom, cow: Number(draft.cow), buffalo: Number(draft.buffalo) };
    if (!clean.effectiveFrom || isNaN(clean.cow) || isNaN(clean.buffalo) || clean.cow <= 0 || clean.buffalo <= 0) {
      alert("Please fill valid numbers for both rates.");
      return;
    }
    const today = todayKey();
    // if (clean.effectiveFrom < today) { alert("Rate update must start today or in the future."); return; }
    if (latestRate && clean.effectiveFrom <= latestRate.effectiveFrom) { alert(`New rate must start after ${latestRate.effectiveFrom}.`); return; }
    setRates((cur) => [...cur, clean]);
    setShowRateDialog(false);
  }

  const totals = useMemo(() => {
    let cowKg = 0, bufKg = 0, cost = 0;
    for (const e of entries) {
      const r = rateForDate(e.date);
      if (!r) continue;
      if (e.type === "cow") cowKg += e.kg; else bufKg += e.kg;
      const perKg = e.type === "cow" ? r.cow : r.buffalo;
      cost += perKg * e.kg;
    }
    return { cowKg, bufKg, kg: cowKg + bufKg, cost };
  }, [entries, rates]);

  // Build per-day summaries for stickers & tooltip
  const dayMap = useMemo(() => {
    const map = new Map();
    for (const e of monthEntries) {
      const r = rateForDate(e.date);
      const perKg = e.type === "cow" ? r?.cow ?? 0 : r?.buffalo ?? 0;
      const obj = map.get(e.date) || { cowKg: 0, bufKg: 0, cost: 0 };
      if (e.type === "cow") obj.cowKg += e.kg; else obj.bufKg += e.kg;
      obj.cost += perKg * e.kg;
      map.set(e.date, obj);
    }
    return map;
  }, [monthEntries, rates]);

  function Header() {
    return (
      <div className="md:flex gap-4 items-center justify-between mb-4">
        <h1 className="text-2xl text-center md:text-4xl font-fun font-bold text-violet-700 drop-shadow-md">
          🥛 Dairy Expense Tracker
        </h1>
        <div className="flex justify-around md:flex gap-3">
          <button
            onClick={() => { setRateDraft({ effectiveFrom: todayKey(), cow: latestRate?.cow ?? "", buffalo: latestRate?.buffalo ?? "" }); setShowRateDialog(true); }}
            className="mr-5 mt-3 px-3 py-2 sm:px-4 sm:py-2 md:px-6 md:py-3 mr-0 rounded-2xl bg-pink-200 hover:bg-pink-300 text-pink-900 shadow font-fun font-semibold text-lg"
          >
            Set / Update Rates
          </button>
          <button
            onClick={() => { setEntryDraft({ date: todayKey(), type: "buffalo", kg: "" }); setShowEntryDialog(true); }}
            className="mt-3 px-3 py-2 sm:px-4 sm:py-2 md:px-6 md:py-3 rounded-2xl bg-blue-200 hover:bg-blue-300 text-blue-900 shadow font-fun font-semibold text-lg"
          >
            Add Entry
          </button>
        </div>
      </div>
    );
  }

  function StatCard({ title, value, icon }) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-white/80 shadow-sm border border-violet-100">
        {icon && <img src={icon} alt="" className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 object-contain" />}
        <div>
          <div className="text-md sm:text-lg md:text-xl text-violet-500">{title}</div>
          <div className="text-md sm:text-lg md:text-xl font-fun font-semibold text-violet-900">{value}</div>
        </div>
      </div>
    );
  }

  function Stats() {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard title="Cow Milk (kg)" value={totals.cowKg.toFixed(2)} icon={STICKERS.cow} />
        <StatCard title="Buffalo Milk (kg)" value={totals.bufKg.toFixed(2)} icon={STICKERS.buffalo} />
        <StatCard title="Total Milk (kg)" value={totals.kg.toFixed(2)} />
        <StatCard title="Total Cost (₹)" value={totals.cost.toFixed(2)} />
      </div>
    );
  }

  function MonthNav() {
    const label = month.toLocaleString(undefined, { month: "long", year: "numeric" });
    return (
      <div className="flex items-center justify-between mb-2">
        <button
          className="text-sm sm:text-md md:text-xl px-3 py-1 sm:px-4 sm:py-2 md:px-6 md:py-3 rounded-full bg-violet-100 hover:bg-violet-200 text-violet-700"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        >◀ Prev</button>
        <div className="text-lg sm:text-xl md:text-2xl font-fun font-bold text-violet-700">{label}</div>
        <button
          className="text-sm sm:text-md md:text-xl px-3 py-1 sm:px-4 sm:py-2 md:px-6 md:py-3 rounded-full bg-violet-100 hover:bg-violet-200 text-violet-700"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        >Next ▶</button>
      </div>
    );
  }

  function Calendar() {
    const matrix = daysMatrix(month);
    const monthIndex = month.getMonth();

    function DayCell({ date }) {
      const inMonth = date.getMonth() === monthIndex;
      const key = toKey(date);
      const isToday = key === todayKey();
      const sum = dayMap.get(key); // {cowKg, bufKg, cost}

      const tooltipText = sum
        ? `Cow: ${sum.cowKg.toFixed(2)} kg\nBuffalo: ${sum.bufKg.toFixed(2)} kg\nCost: ₹${sum.cost.toFixed(2)}`
        : "";

      return (
        <button
          onClick={() => { setEntryDraft({ date: key, type: "cow", kg: "" }); setShowEntryDialog(true); }}
          className={`text-sm sm:text-lg md:text-2xl` +
            `relative sm:h-12 md:h-20 lg:h-24 p-2 rounded-xl border transition text-left tooltip ` +
            (inMonth ? "bg-white/70 border-violet-100 hover:border-violet-300" : "bg-white/40 border-transparent opacity-60")
          }
        >
          {/* <span className={`text-md ${isToday ? "font-fun font-bold text-violet-900" : "text-violet-500"}`}>{date.getDate()}</span> */}
           {/* 👇 Mobile pink if milk was bought */}
          <span className={`text-md ${isToday ? "font-fun font-bold text-violet-900" : ""} ${sum ? "text-pink-500 sm:text-violet-500" : "text-violet-500"}`}>{date.getDate()}</span>
          {/* Stickers row */}
          <div className="absolute bottom-2 left-8 right-2 flex items-center gap-.5 ">
            {sum?.cowKg > 0 && <img src={STICKERS.cow} alt="cow" className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 object-contain " />}
            {sum?.bufKg > 0 && <img src={STICKERS.buffalo} alt="buffalo" className="w-8 h-8 sm:w-12 sm:h-12 md:w-16 md:h-16 object-contain" />}
          </div>
          {tooltipText && <span className="tooltiptext">{tooltipText}</span>}
        </button>
      );
    }

    return (
      <div className="rounded-2xl bg-violet-50 p-3 border border-violet-100">
        <MonthNav />
        <div className="grid grid-cols-7 gap-2 text-center text-sm sm:text-md md:text-2xl text-violet-500 mb-2">
          {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d)=> <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-2 text-center text-sm sm:text-md md:text-2xl text-violet-700">
          {matrix.flat().map((d,i) => <DayCell key={i} date={d} />)}
        </div>
      </div>
    );
  }

  function Dialog({ open, onClose, title, children, actions }) {
    if (!open) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/20" onClick={onClose} />
        <div className="relative w-[95%] max-w-xl bg-white rounded-3xl shadow-xl p-5 border border-violet-100">
          <div className="text-xl sm:text-2xl md:text-3xl font-fun font-semibold text-violet-900 mb-3">{title}</div>
          <div>{children}</div>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-1.5 sm:px-4 sm:py-2 md:px-6 md:py-3 rounded-xl bg-gray-100 hover:bg-gray-200">Cancel</button>
            {actions}
          </div>
        </div>
      </div>
    );
  }

  function EntryDialog() {
    const currentType = MILK_TYPES.find(t => t.id === entryDraft.type);
    return (
      <Dialog
        open={showEntryDialog}
        onClose={() => setShowEntryDialog(false)}
        title={`Add Milk Entry – ${entryDraft.date}`}
        actions={
          <button onClick={() => addEntry(entryDraft)} className="px-3 py-1 sm:px-4 sm:py-2 md:px-6 md:py-3 rounded-xl bg-violet-600 text-white hover:bg-violet-700">Save Entry</button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-violet-600">Milk Type</label>
            <div className="mt-1 flex gap-2">
              {MILK_TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setEntryDraft((d) => ({ ...d, type: t.id }))}
                  className={`flex items-center gap-2 px-3 py-1 sm:px-4 sm:py-2 md:px-6 md:py-3 rounded-xl border ${entryDraft.type === t.id ? "bg-pink-200 border-pink-300" : "bg-white border-violet-200"}`}
                >
                  <img src={t.icon} alt={t.label} className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 object-contain" />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm text-violet-600">Weight (kg)</label>
            <input
              type="number" min="0" step="0.1"
              className="mt-1 w-full px-3 py-1 rounded-xl border border-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-300"
              value={entryDraft.kg}
              onChange={(e) => setEntryDraft((d) => ({ ...d, kg: e.target.value }))}
              placeholder="e.g., 1.5"
            />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-violet-500">
          {currentType && <img src={currentType.icon} className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8" alt="" />}
          <span>Price will use the rate effective on {entryDraft.date}.</span>
        </div>
      </Dialog>
    );
  }

  function RateDialog() {
    return (
      <Dialog
        open={showRateDialog}
        onClose={() => setShowRateDialog(false)}
        title="Set / Update Milk Rates (₹ per kg)"
        actions={<button onClick={() => addRate(rateDraft)} className="px-3 py-1 sm:px-4 sm:py-2 md:px-6 md:py-3 rounded-xl bg-violet-600 text-white hover:bg-violet-700">Save Rates</button>}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-sm text-violet-600">Effective From</label>
            <input
              type="date"
              className="mt-1 w-full px-3 py-1 sm:px-4 sm:py-2 md:px-6 md:py-3 rounded-xl border border-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-300"
              value={rateDraft.effectiveFrom}
              onChange={(e) => setRateDraft((d) => ({ ...d, effectiveFrom: e.target.value }))}
              // min={todayKey()}
            />
          </div>
          <div>
            <label className="text-sm text-violet-600">Cow Rate (₹/kg)</label>
            <input
              type="number" min="0" step="1"
              className="mt-1 w-full px-3 py-1 sm:px-4 sm:py-2 md:px-6 md:py-3 rounded-xl border border-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-300"
              value={rateDraft.cow}
              onChange={(e) => setRateDraft((d) => ({ ...d, cow: e.target.value }))}
              placeholder="e.g., 60"
            />
          </div>
          <div>
            <label className="text-sm text-violet-600">Buffalo Rate (₹/kg)</label>
            <input
              type="number" min="0" step="1"
              className="mt-1 w-full px-3 py-1 sm:px-4 sm:py-2 md:px-6 md:py-3 rounded-xl border border-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-300"
              value={rateDraft.buffalo}
              onChange={(e) => setRateDraft((d) => ({ ...d, buffalo: e.target.value }))}
              placeholder="e.g., 80"
            />
          </div>
        </div>
        {latestRate && (
          <div className="mt-3 text-xs text-violet-500">
            Current latest rate from <b>{latestRate.effectiveFrom}</b>: Cow ₹{latestRate.cow}/kg, Buffalo ₹{latestRate.buffalo}/kg
          </div>
        )}
      </Dialog>
    );
  }

  function EntryList() {
    const monthLabel = month.toLocaleString(undefined, { month: "long", year: "numeric" });
    const rows = monthEntries
      .slice()
      .sort((a,b) => a.date.localeCompare(b.date))
      .map((e, idx) => {
        const r = rateForDate(e.date);
        const price = (e.type === "buffalo" ? r?.buffalo : r?.cow) ?? 0;
        const amount = price * e.kg;
        return (
          <tr key={idx} className="border-b last:border-0">
            <td className="py-2 text-violet-700">{e.date}</td>
            <td className="py-2 flex items-center gap-2">
              <img src={e.type === "buffalo" ? STICKERS.buffalo : STICKERS.cow} alt="" className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8" />
              {e.type === "buffalo" ? "Buffalo" : "Cow"}
            </td>
            <td className="py-2 text-right">{e.kg.toFixed(2)}</td>
            <td className="py-2 text-right">₹{price.toFixed(2)}</td>
            <td className="py-2 text-right font-medium">₹{amount.toFixed(2)}</td>
          </tr>
        );
      });

    return (
      <div className="mt-6 rounded-2xl bg-white/80 border border-violet-100 p-4">
        <div className="text-sm sm:text-md md:text-2xl text-violet-700 font-fun font-semibold mb-2">Entries – {monthLabel}</div>
        {rows.length === 0 ? (
          <div className="text-sm sm:text-md text-violet-500">No entries this month. Click a date in the calendar or "Add Entry" to begin.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[600px] md:min-w-full text-left text-sm sm:text-md md:text-lg">
              <thead>
                <tr className="text-sm sm:text-md md:text-lg text-left text-violet-500 border-b">
                  <th className="py-2">Date</th>
                  <th className="py-2">Type</th>
                  <th className="py-2 text-right">Weight (kg)</th>
                  <th className="py-2 text-right">Rate (₹/kg)</th>
                  <th className="py-2 text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>{rows}</tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  function EmptyRatesBanner() {
    if (rates.length > 0) return null;
    return (
      <div className="mb-4 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800">
        💡 Tip: Set your <b>initial rates</b> to start tracking. Click "Set / Update Rates".
      </div>
    );
  }

  function ExportButtons() {
    function exportTxt() {
      let content = "Date\tType\tKg\tRate(₹/kg)\tAmount(₹)\\n";
      const ordered = [...entries].sort((a,b)=>a.date.localeCompare(b.date));
      for (const e of ordered) {
        const r = rateForDate(e.date);
        const rate = e.type === "cow" ? r?.cow ?? 0 : r?.buffalo ?? 0;
        content += `${e.date}\t${e.type}\t${e.kg}\t${rate}\t${(rate*e.kg).toFixed(2)}\\n`;
      }
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "milk_records.txt";
      a.click();
    }
    return (
      <div className="mt-4 flex gap-2">
        <button onClick={exportTxt} className="px-3 py-2 sm:px-4 sm:py-2 md:px-6 md:py-3 text-sm sm:text-md md:text-lg rounded-2xl bg-emerald-200 hover:bg-emerald-300 text-emerald-900 shadow">
          💾 Export .txt
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-100 via-pink-100 to-blue-100 p-4 md:p-8 font-[system-ui]">
      <div className="mx-auto max-w-5xl">
        <Header />
        <EmptyRatesBanner />
        <Stats />
        <Calendar />
        <EntryList />
        <ExportButtons />
      </div>

      <EntryDialog />
      <RateDialog />

      <div className="mt-8 text-center text-xs font-fun text-violet-500">
        Designed by Kirandeep with ❤️ in a cute pastel theme 🧁 – data stays in your browser (LocalStorage).
      </div>
    </div>
  );
}

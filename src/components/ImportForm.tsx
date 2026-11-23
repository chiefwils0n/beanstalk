"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { importTransactions, previewImport, type ImportPreview } from "../lib/actions";
import {
  buildImportRows,
  detectColumns,
  findRepeatsInFile,
  looksLikeHeader,
  parseCsv,
  MAX_IMPORT_ROWS,
  type AmountMode,
  type ColumnMapping,
  type DateFormat,
} from "../lib/csvImport";
import { formatDate, formatMoney, parseDate } from "../lib/money";
import type { AccountOption } from "./EntryForm";

type RowEdit = { include?: boolean; categoryId?: string; memo?: string };

export function ImportForm({ accounts }: { accounts: AccountOption[] }) {
  const [pending, startTransition] = useTransition();
  const [accountId, setAccountId] = useState("");
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<string[][] | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [edits, setEdits] = useState<Record<number, RowEdit>>({});
  const [preview, setPreview] = useState<{ key: string; data: ImportPreview } | null>(null);
  const [bulkCategory, setBulkCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const loadFile = async (file: File | undefined) => {
    setError(null);
    setDone(null);
    setEdits({});
    setPreview(null);
    if (!file) {
      setTable(null);
      setMapping(null);
      setFileName("");
      return;
    }
    const parsed = parseCsv(await file.text());
    if (parsed.length === 0) {
      setTable(null);
      setMapping(null);
      setError("That file has no rows.");
      return;
    }
    const header = looksLikeHeader(parsed[0]);
    setFileName(file.name);
    setTable(parsed);
    setHasHeader(header);
    setMapping(detectColumns(header ? parsed[0] : []));
  };

  const columnCount = table ? Math.max(...table.map((r) => r.length)) : 0;
  const columnNames = useMemo(
    () =>
      Array.from({ length: columnCount }, (_, i) =>
        hasHeader && table?.[0]?.[i] ? table[0][i] : `Column ${i + 1}`
      ),
    [columnCount, hasHeader, table]
  );

  const { rows, errors } = useMemo(() => {
    if (!table || !mapping) return { rows: [], errors: [] };
    return buildImportRows(hasHeader ? table.slice(1) : table, mapping);
  }, [table, mapping, hasHeader]);
  const repeats = useMemo(() => findRepeatsInFile(rows), [rows]);
  const tooMany = rows.length > MAX_IMPORT_ROWS;

  // Ask the server which rows are already in the books and what category each
  // description got last time. Keyed so a stale answer is never applied.
  const previewKey = useMemo(
    () => (accountId && rows.length && !tooMany ? JSON.stringify([accountId, rows]) : ""),
    [accountId, rows, tooMany]
  );
  useEffect(() => {
    if (!previewKey) return;
    let stale = false;
    previewImport(
      accountId,
      rows.map((r) => ({ date: r.date, amount: r.amount, description: r.description }))
    ).then((result) => {
      if (stale) return;
      if ("error" in result) setError(result.error);
      else setPreview({ key: previewKey, data: result });
    });
    return () => {
      stale = true;
    };
  }, [previewKey, accountId, rows]);
  const live = preview && preview.key === previewKey ? preview.data : null;
  const checking = !!previewKey && !live;

  const view = rows.map((row, i) => {
    const edit = edits[row.line] ?? {};
    const match = live?.matches[i] ?? null;
    const repeat = repeats.has(i);
    return {
      row,
      match,
      repeat,
      include: edit.include ?? (!match && !repeat),
      categoryId: edit.categoryId ?? live?.suggestions[i] ?? "",
      memo: edit.memo ?? row.description,
    };
  });
  const included = view.filter((v) => v.include);
  const uncategorized = included.filter((v) => !v.categoryId || v.categoryId === accountId);
  const missingMemo = included.filter((v) => !v.memo.trim());
  const moneyIn = included.reduce((s, v) => s + (v.row.amount > 0 ? v.row.amount : 0), 0);
  const moneyOut = included.reduce((s, v) => s + (v.row.amount < 0 ? -v.row.amount : 0), 0);

  const setEdit = (line: number, patch: RowEdit) =>
    setEdits((prev) => ({ ...prev, [line]: { ...prev[line], ...patch } }));
  const setMap = (patch: Partial<ColumnMapping>) => {
    setMapping((prev) => (prev ? { ...prev, ...patch } : prev));
    setDone(null);
  };

  const applyBulk = () => {
    if (!bulkCategory) return;
    setEdits((prev) => {
      const next = { ...prev };
      for (const v of uncategorized) next[v.row.line] = { ...next[v.row.line], categoryId: bulkCategory };
      return next;
    });
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await importTransactions({
        accountId,
        rows: included.map((v) => ({
          date: v.row.date,
          memo: v.memo,
          reference: v.row.reference || undefined,
          amount: v.row.amount,
          categoryAccountId: v.categoryId,
        })),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone(result.imported ?? 0);
      setTable(null);
      setMapping(null);
      setEdits({});
      setPreview(null);
      setFileName("");
    });
  };

  const columnSelect = (
    label: string,
    value: number,
    onChange: (idx: number) => void,
    optional = false
  ) => (
    <div>
      <label className="label">{label}</label>
      <select className="input" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        <option value={-1}>{optional ? "— none —" : "— choose column —"}</option>
        {columnNames.map((name, i) => (
          <option key={i} value={i}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );

  const mappingIncomplete =
    !!mapping &&
    (mapping.date < 0 ||
      (mapping.mode === "split"
        ? mapping.moneyOut < 0 || mapping.moneyIn < 0
        : mapping.amount < 0 || (mapping.mode === "indicator" && mapping.indicator < 0)));

  const blocker = !accountId
    ? "Choose the account this file is from."
    : tooMany
      ? `This file has ${rows.length} rows — import at most ${MAX_IMPORT_ROWS} at a time.`
      : checking
        ? "Checking your books for transactions that are already recorded…"
        : included.length === 0
          ? "No rows selected."
          : missingMemo.length > 0
            ? `${missingMemo.length} selected row(s) need a description.`
            : uncategorized.length > 0
              ? `${uncategorized.length} selected row(s) still need a category.`
              : null;

  return (
    <div className="flex flex-col gap-6">
      {done !== null && (
        <div className="card flex flex-wrap items-center gap-3 border-emerald-300 dark:border-emerald-800">
          <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            Imported {done} transaction{done === 1 ? "" : "s"}.
          </span>
          <Link href="/transactions" className="btn btn-sm">
            View transactions
          </Link>
        </div>
      )}

      <div className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Import into account</label>
          <select
            className="input max-w-72"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">— choose account —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">CSV file from your bank or card</label>
          <input
            // Remount after a successful import so the same file can be re-picked.
            key={done ?? "file"}
            type="file"
            accept=".csv,text/csv"
            className="input"
            onChange={(e) => loadFile(e.target.files?.[0])}
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {table && mapping && (
        <>
          <div className="card flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Columns</h2>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={hasHeader}
                  onChange={(e) => setHasHeader(e.target.checked)}
                />
                First row is column names
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {columnSelect("Date", mapping.date, (date) => setMap({ date }))}
              <div>
                <label className="label">Date format</label>
                <select
                  className="input"
                  value={mapping.dateFormat}
                  onChange={(e) => setMap({ dateFormat: e.target.value as DateFormat })}
                >
                  <option value="MDY">Month / Day / Year</option>
                  <option value="DMY">Day / Month / Year</option>
                </select>
              </div>
              {columnSelect("Description", mapping.description, (description) => setMap({ description }), true)}
              {columnSelect("Reference / check #", mapping.reference, (reference) => setMap({ reference }), true)}
              <div>
                <label className="label">Amounts are in</label>
                <select
                  className="input"
                  value={mapping.mode}
                  onChange={(e) => setMap({ mode: e.target.value as AmountMode })}
                >
                  <option value="signed">One column (+ / −)</option>
                  <option value="indicator">One column + Credit/Debit column</option>
                  <option value="split">Separate in / out columns</option>
                </select>
              </div>
              {mapping.mode === "split" ? (
                <>
                  {columnSelect("Money out", mapping.moneyOut, (moneyOut) => setMap({ moneyOut }))}
                  {columnSelect("Money in", mapping.moneyIn, (moneyIn) => setMap({ moneyIn }))}
                </>
              ) : (
                <>
                  {columnSelect("Amount", mapping.amount, (amount) => setMap({ amount }))}
                  {mapping.mode === "indicator" &&
                    columnSelect("Credit/Debit", mapping.indicator, (indicator) => setMap({ indicator }))}
                </>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={mapping.flipSign}
                onChange={(e) => setMap({ flipSign: e.target.checked })}
              />
              Reverse money in / out (for card exports that list charges as positive)
            </label>
            {mappingIncomplete && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Choose the date and amount columns to read this file.
              </p>
            )}
            {!mappingIncomplete && errors.length > 0 && (
              <div className="text-sm text-amber-600 dark:text-amber-400">
                {`${errors.length} ${errors.length === 1 ? "row" : "rows"} can't be read and will be left out:`}
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {errors.slice(0, 5).map((e) => (
                    <li key={e.line}>
                      Row {e.line}: {e.message}
                    </li>
                  ))}
                  {errors.length > 5 && <li>…and {errors.length - 5} more</li>}
                </ul>
              </div>
            )}
          </div>

          {rows.length > 0 && !tooMany && (
            <div className="card flex flex-col gap-3 p-0">
              <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5">
                <div>
                  <h2 className="font-semibold">
                    Review — {fileName} ({rows.length} row{rows.length === 1 ? "" : "s"})
                  </h2>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Rows already in your books, or repeated in the file, start unchecked so
                    nothing is counted twice. Check any you still want.
                  </p>
                </div>
                <div className="flex items-end gap-2">
                  <div>
                    <label className="label">Category for rows without one</label>
                    <select
                      className="input max-w-64"
                      value={bulkCategory}
                      onChange={(e) => setBulkCategory(e.target.value)}
                    >
                      <option value="">— choose account —</option>
                      {accounts
                        .filter((a) => a.id !== accountId)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.label}
                          </option>
                        ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={applyBulk}
                    disabled={!bulkCategory || uncategorized.length === 0}
                  >
                    Apply
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th w-8" />
                      <th className="th">Date</th>
                      <th className="th">Description</th>
                      <th className="th text-right">Money in</th>
                      <th className="th text-right">Money out</th>
                      <th className="th w-[26%]">Category</th>
                      <th className="th">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.map(({ row, match, repeat, include, categoryId, memo }) => (
                      <tr key={row.line} className={include ? "" : "opacity-60"}>
                        <td className="td">
                          <input
                            type="checkbox"
                            aria-label={`Import row ${row.line}`}
                            checked={include}
                            onChange={(e) => setEdit(row.line, { include: e.target.checked })}
                          />
                        </td>
                        <td className="td whitespace-nowrap text-zinc-500">
                          {formatDate(parseDate(row.date))}
                        </td>
                        <td className="td">
                          {include ? (
                            <input
                              className="input"
                              aria-label={`Description for row ${row.line}`}
                              value={memo}
                              onChange={(e) => setEdit(row.line, { memo: e.target.value })}
                            />
                          ) : (
                            memo
                          )}
                          {row.reference && (
                            <span className="ml-2 text-xs text-zinc-400">#{row.reference}</span>
                          )}
                        </td>
                        <td className="td money text-right text-emerald-700 dark:text-emerald-400">
                          {row.amount > 0 ? formatMoney(row.amount) : ""}
                        </td>
                        <td className="td money text-right">
                          {row.amount < 0 ? formatMoney(-row.amount) : ""}
                        </td>
                        <td className="td">
                          {include && (
                            <select
                              className="input"
                              aria-label={`Category for row ${row.line}`}
                              value={categoryId}
                              onChange={(e) => setEdit(row.line, { categoryId: e.target.value })}
                            >
                              <option value="">— choose account —</option>
                              {accounts
                                .filter((a) => a.id !== accountId)
                                .map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.label}
                                  </option>
                                ))}
                            </select>
                          )}
                        </td>
                        <td className="td whitespace-nowrap text-xs">
                          {match ? (
                            <Link
                              href={`/transactions/${match.entryId}`}
                              target="_blank"
                              className="badge bg-blue-100 text-blue-700 hover:underline dark:bg-blue-950 dark:text-blue-300"
                              title={`${formatDate(parseDate(match.date))} — ${match.memo}`}
                            >
                              Already in books
                            </Link>
                          ) : repeat ? (
                            <span
                              className="badge bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                              title="Same date and amount as an earlier row in this file"
                            >
                              Repeat in file
                            </span>
                          ) : (
                            <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                              New
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-5">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {included.length} of {rows.length} selected · in {formatMoney(moneyIn)} · out{" "}
                  {formatMoney(moneyOut)}
                  {blocker && <span className="ml-2 text-amber-600 dark:text-amber-400">{blocker}</span>}
                </p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={submit}
                  disabled={pending || !!blocker}
                >
                  {pending
                    ? "Importing…"
                    : `Import ${included.length} transaction${included.length === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          )}
          {tooMany && <p className="text-sm text-red-600 dark:text-red-400">{blocker}</p>}
        </>
      )}
    </div>
  );
}

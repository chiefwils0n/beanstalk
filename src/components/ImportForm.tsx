"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { addImportRule, importTransactions, previewImport, type ImportPreview } from "../lib/actions";
import {
  buildImportRows,
  detectColumns,
  encodeSavedMapping,
  findRepeatsInFile,
  looksLikeHeader,
  parseCsv,
  parseCsvAmount,
  savedMappingForFile,
  MAX_IMPORT_ROWS,
  type AmountMode,
  type ColumnMapping,
  type DateFormat,
} from "../lib/csvImport";
import { formatDate, formatMoney, parseDate } from "../lib/money";
import type { AccountOption } from "./EntryForm";

/** One category's share of a split row; `amount` is what the user typed. */
type SplitEdit = { categoryId: string; amount: string };
type RowEdit = { include?: boolean; categoryId?: string; memo?: string; splits?: SplitEdit[] };

const widestRow = (table: string[][]) => Math.max(...table.map((r) => r.length));
const moneyInput = (cents: number) => (cents / 100).toFixed(2);

export function ImportForm({
  accounts,
  savedMappings,
  loans = [],
}: {
  accounts: AccountOption[];
  /** Remembered column layout (JSON) by account id. */
  savedMappings: Record<string, string>;
  /** Active loans, so a row that pays one down can say so. */
  loans?: { id: string; name: string; liabilityAccountId: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [accountId, setAccountId] = useState("");
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<string[][] | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  // Where the current column mapping came from: guessed from the file, the
  // layout remembered for this account, or the user's own changes (which a
  // later account switch must not overwrite).
  const [mappingSource, setMappingSource] = useState<"guess" | "saved" | "manual">("guess");
  const [markCleared, setMarkCleared] = useState(true);
  const [clearExisting, setClearExisting] = useState(true);
  const [edits, setEdits] = useState<Record<number, RowEdit>>({});
  const [preview, setPreview] = useState<{ key: string; data: ImportPreview } | null>(null);
  const [bulkCategory, setBulkCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ imported: number; cleared: number; loanPayments: number } | null>(null);
  // Quick "add a rule" row in the review card. Bumping rulesVersion re-asks
  // the server for suggestions so a new rule fills in matching rows at once.
  const [ruleText, setRuleText] = useState("");
  const [ruleCategory, setRuleCategory] = useState("");
  const [ruleNote, setRuleNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [rulesVersion, setRulesVersion] = useState(0);
  const [savingRule, startRuleTransition] = useTransition();

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
    setFileName(file.name);
    setTable(parsed);
    chooseMapping(parsed, accountId);
  };

  /** Use the layout remembered for the account if it fits this file, else guess. */
  const chooseMapping = (parsed: string[][], forAccountId: string) => {
    const saved = savedMappingForFile(savedMappings[forAccountId], parsed[0], widestRow(parsed));
    const header = saved ? saved.hasHeader : looksLikeHeader(parsed[0]);
    setHasHeader(header);
    setMapping(saved ? saved.mapping : detectColumns(header ? parsed[0] : []));
    setMappingSource(saved ? "saved" : "guess");
  };

  const changeAccount = (id: string) => {
    setAccountId(id);
    if (table && mappingSource !== "manual") chooseMapping(table, id);
  };

  const columnCount = table ? widestRow(table) : 0;
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
    () => (accountId && rows.length && !tooMany ? JSON.stringify([accountId, rulesVersion, rows]) : ""),
    [accountId, rows, tooMany, rulesVersion]
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
    const suggestion = live?.suggestions[i] ?? "";
    const splits = edit.splits ?? null;
    const parts = (splits ?? []).map((s) => ({ categoryId: s.categoryId, cents: parseCsvAmount(s.amount) }));
    const assigned = parts.reduce((sum, p) => sum + (p.cents ?? 0), 0);
    // Money going out to exactly one loan's liability account is a loan payment.
    const categories = splits
      ? parts.filter((p) => (p.cents ?? 0) > 0).map((p) => p.categoryId)
      : [edit.categoryId ?? suggestion];
    const paying = row.amount < 0 ? loans.filter((l) => categories.includes(l.liabilityAccountId)) : [];
    return {
      row,
      loan: paying.length === 1 ? paying[0] : null,
      splits,
      parts,
      /** Cents of a split row not yet given to a category (0 when it adds up). */
      remaining: Math.abs(row.amount) - assigned,
      match,
      repeat,
      // The rule behind this row's category, while the category is still the rule's.
      rule: (edit.categoryId ?? suggestion) === suggestion ? (live?.ruleMatches[i] ?? null) : null,
      include: edit.include ?? (!match && !repeat),
      categoryId: edit.categoryId ?? suggestion,
      memo: edit.memo ?? row.description,
    };
  });
  const included = view.filter((v) => v.include);
  const uncategorized = included.filter((v) => !v.splits && (!v.categoryId || v.categoryId === accountId));
  const badSplits = included.filter(
    (v) =>
      v.splits &&
      (v.remaining !== 0 || v.parts.some((p) => !p.cents || !p.categoryId || p.categoryId === accountId))
  );
  // Rows the file confirms are already in the books but aren't cleared yet.
  const clearable = view.filter((v) => !v.include && v.match?.cleared === "NONE");
  const missingMemo = included.filter((v) => !v.memo.trim());
  const moneyIn = included.reduce((s, v) => s + (v.row.amount > 0 ? v.row.amount : 0), 0);
  const moneyOut = included.reduce((s, v) => s + (v.row.amount < 0 ? -v.row.amount : 0), 0);

  const setEdit = (line: number, patch: RowEdit) =>
    setEdits((prev) => ({ ...prev, [line]: { ...prev[line], ...patch } }));
  const setMap = (patch: Partial<ColumnMapping>) => {
    setMapping((prev) => (prev ? { ...prev, ...patch } : prev));
    setMappingSource("manual");
    setDone(null);
  };

  const startSplit = (line: number, categoryId: string, amount: number) =>
    setEdit(line, {
      splits: [
        { categoryId, amount: moneyInput(Math.abs(amount)) },
        { categoryId: "", amount: "" },
      ],
    });
  const setSplit = (line: number, splits: SplitEdit[], index: number, patch: Partial<SplitEdit>) =>
    setEdit(line, { splits: splits.map((s, i) => (i === index ? { ...s, ...patch } : s)) });

  const applyBulk = () => {
    if (!bulkCategory) return;
    setEdits((prev) => {
      const next = { ...prev };
      for (const v of uncategorized) next[v.row.line] = { ...next[v.row.line], categoryId: bulkCategory };
      return next;
    });
  };

  const saveRule = () => {
    setRuleNote(null);
    startRuleTransition(async () => {
      const result = await addImportRule({ match: ruleText, categoryAccountId: ruleCategory });
      if (result.error) {
        setRuleNote({ ok: false, text: result.error });
        return;
      }
      setRuleNote({ ok: true, text: `Rule saved for "${ruleText.trim()}".` });
      setRuleText("");
      setRuleCategory("");
      setRulesVersion((v) => v + 1);
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
          categoryAccountId: v.splits ? "" : v.categoryId,
          splits: v.splits
            ? v.parts.map((p) => ({ categoryAccountId: p.categoryId, amount: p.cents ?? 0 }))
            : undefined,
        })),
        markCleared,
        clearLineIds: clearExisting ? clearable.map((v) => v.match!.lineId) : [],
        savedMapping:
          table && mapping ? encodeSavedMapping(table[0], columnCount, hasHeader, mapping) : undefined,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone({ imported: result.imported ?? 0, cleared: result.cleared ?? 0, loanPayments: result.loanPayments ?? 0 });
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
        : included.length === 0 && !(clearExisting && clearable.length > 0)
          ? "No rows selected."
          : missingMemo.length > 0
            ? `${missingMemo.length} selected row(s) need a description.`
            : uncategorized.length > 0
              ? `${uncategorized.length} selected row(s) still need a category.`
              : badSplits.length > 0
                ? `${badSplits.length} split row(s) need a category and amount on every line, adding up to the total.`
                : null;

  return (
    <div className="flex flex-col gap-6">
      {done !== null && (
        <div className="card flex flex-wrap items-center gap-3 border-emerald-300 dark:border-emerald-800">
          <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            Imported {done.imported} transaction{done.imported === 1 ? "" : "s"}.
            {done.cleared > 0 &&
              ` Marked ${done.cleared} already in your books as cleared.`}
            {done.loanPayments > 0 &&
              ` Recorded ${done.loanPayments} loan payment${done.loanPayments === 1 ? "" : "s"}.`}
          </span>
          <Link href="/transactions" className="btn btn-sm">
            View transactions
          </Link>
          <Link href="/reconcile" className="btn btn-sm">
            Reconcile
          </Link>
        </div>
      )}

      <div className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Import into account</label>
          <select
            className="input max-w-72"
            value={accountId}
            onChange={(e) => changeAccount(e.target.value)}
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
            key={done ? "after-import" : "file"}
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
                  onChange={(e) => {
                    setHasHeader(e.target.checked);
                    setMappingSource("manual");
                  }}
                />
                First row is column names
              </label>
            </div>
            {mappingSource === "saved" && (
              <p className="text-sm text-emerald-700 dark:text-emerald-400">
                Using the columns from your last import into this account.
              </p>
            )}
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
              <div className="flex flex-wrap items-end gap-2 border-y border-zinc-200 px-5 py-3 dark:border-zinc-800">
                <div>
                  <label className="label">New rule: description contains</label>
                  <input
                    className="input w-56"
                    value={ruleText}
                    maxLength={200}
                    placeholder="e.g. Herring Rental"
                    onChange={(e) => setRuleText(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Always use category</label>
                  <select
                    className="input max-w-64"
                    value={ruleCategory}
                    onChange={(e) => setRuleCategory(e.target.value)}
                  >
                    <option value="">— choose account —</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="btn"
                  onClick={saveRule}
                  disabled={savingRule || !ruleText.trim() || !ruleCategory}
                >
                  {savingRule ? "Saving…" : "Save rule"}
                </button>
                <Link href="/settings/import-rules" target="_blank" className="btn">
                  Manage rules
                </Link>
                {ruleNote && (
                  <p
                    className={`w-full text-sm ${
                      ruleNote.ok
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {ruleNote.text}
                  </p>
                )}
              </div>
              <div className="overflow-x-auto">
                {/* A floor on the width: below it the table scrolls sideways
                    rather than crushing the description and category columns. */}
                <table className="w-full min-w-[60rem]">
                  <thead>
                    <tr>
                      <th className="th w-8" />
                      <th className="th">Date</th>
                      <th className="th min-w-[14rem]">Description</th>
                      <th className="th text-right">Money in</th>
                      <th className="th text-right">Money out</th>
                      <th className="th w-[32%] min-w-[19rem]">Category</th>
                      <th className="th">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.map(({ row, match, repeat, rule, include, categoryId, memo, splits, remaining, loan }) => (
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
                          {include && !splits && (
                            <div className="flex items-center gap-1">
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
                              <button
                                type="button"
                                className="btn btn-sm"
                                title="Divide this transaction between several categories"
                                aria-label={`Split row ${row.line}`}
                                onClick={() => startSplit(row.line, categoryId, row.amount)}
                              >
                                Split
                              </button>
                            </div>
                          )}
                          {include && !splits && rule && (
                            <p className="mt-1 text-xs text-zinc-400">Rule: contains “{rule}”</p>
                          )}
                          {include && loan && (
                            <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                              Also recorded as a payment on the loan “{loan.name}”
                            </p>
                          )}
                          {include && splits && (
                            <div className="flex flex-col gap-1">
                              {splits.map((split, si) => (
                                <div key={si} className="flex items-center gap-1">
                                  <select
                                    className="input min-w-0 flex-1"
                                    aria-label={`Category ${si + 1} for row ${row.line}`}
                                    value={split.categoryId}
                                    onChange={(e) =>
                                      setSplit(row.line, splits, si, { categoryId: e.target.value })
                                    }
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
                                  <input
                                    className="input w-24 text-right"
                                    inputMode="decimal"
                                    placeholder="0.00"
                                    aria-label={`Amount ${si + 1} for row ${row.line}`}
                                    value={split.amount}
                                    onChange={(e) =>
                                      setSplit(row.line, splits, si, { amount: e.target.value })
                                    }
                                  />
                                  {splits.length > 2 && (
                                    <button
                                      type="button"
                                      className="btn btn-sm"
                                      aria-label={`Remove line ${si + 1} from row ${row.line}`}
                                      onClick={() =>
                                        setEdit(row.line, { splits: splits.filter((_, i) => i !== si) })
                                      }
                                    >
                                      ×
                                    </button>
                                  )}
                                </div>
                              ))}
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <button
                                  type="button"
                                  className="underline"
                                  onClick={() =>
                                    setEdit(row.line, {
                                      splits: [
                                        ...splits,
                                        { categoryId: "", amount: remaining > 0 ? moneyInput(remaining) : "" },
                                      ],
                                    })
                                  }
                                >
                                  Add line
                                </button>
                                <button
                                  type="button"
                                  className="underline"
                                  onClick={() => setEdit(row.line, { splits: undefined })}
                                >
                                  Remove split
                                </button>
                                <span
                                  className={
                                    remaining === 0
                                      ? "text-zinc-400"
                                      : "text-amber-600 dark:text-amber-400"
                                  }
                                >
                                  {remaining === 0
                                    ? "Adds up"
                                    : remaining > 0
                                      ? `${formatMoney(remaining)} left to assign`
                                      : `${formatMoney(-remaining)} over`}
                                </span>
                              </div>
                            </div>
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
              <div className="flex flex-col gap-1 px-5 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={markCleared}
                    onChange={(e) => setMarkCleared(e.target.checked)}
                  />
                  Mark imported transactions as cleared, ready to reconcile
                </label>
                {clearable.length > 0 && (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={clearExisting}
                      onChange={(e) => setClearExisting(e.target.checked)}
                    />
                    {`Also mark the ${clearable.length} matching transaction${
                      clearable.length === 1 ? "" : "s"
                    } already in your books as cleared`}
                  </label>
                )}
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
                    : included.length === 0
                      ? `Mark ${clearable.length} as cleared`
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

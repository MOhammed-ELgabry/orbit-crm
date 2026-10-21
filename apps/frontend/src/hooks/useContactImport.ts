import { useCallback, useMemo, useRef, useState } from "react";
import axios from "axios";

import {
  importContacts,
  validateContactImport,
} from "../services/contactService";
import type {
  ColumnMapping,
  ImportEncoding,
  ImportField,
  ImportIssue,
  ImportRowState,
  NameSplitMode,
  ParsedImportFile,
} from "../types/contactImport";
import {
  autoDetectMapping,
  setColumnField,
} from "../lib/contactImport/columnMapping";
import {
  buildImportRows,
  chunkRows,
  countRows,
  createRowState,
  deriveRows,
  toRequestRow,
  updateDraftName,
} from "../lib/contactImport/importRows";
import {
  ImportFileError,
  parseImportFile,
} from "../lib/contactImport/parseFile";
import type { ImportFileErrorCode } from "../lib/contactImport/parseFile";

export type ImportPhase = "upload" | "mapping" | "review" | "result";

export interface ImportFileErrorState {
  code: ImportFileErrorCode;
  limit?: number;
}

/** After a 429 the browser cannot read Retry-After (CORS), so wait for part of the throttler window. */
const DEFAULT_RATE_LIMIT_WAIT_MS = 20_000;
const MAX_RATE_LIMIT_RETRIES = 4;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function rateLimitWaitMs(error: unknown): number {
  const header = axios.isAxiosError(error)
    ? error.response?.headers?.["retry-after"]
    : undefined;
  const seconds = Number(header);

  if (header !== undefined && Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds, 65) * 1000;
  }

  return DEFAULT_RATE_LIMIT_WAIT_MS;
}

function requestFailureIssue(error: unknown): ImportIssue {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  const code =
    status === 403
      ? "forbidden"
      : status === 429
        ? "rateLimited"
        : "requestFailed";

  return { field: "row", code, message: "The request failed." };
}

/**
 * State machine of the Contacts import page: file -> column mapping ->
 * review (server dry-run) -> import (chunked) -> result.
 *
 * Nothing is saved before startImport(). Rows are sent in chunks, one request
 * at a time; a chunk that fails marks only its own rows as failed, and
 * startImport() can be called again to retry just the failed (and the
 * not-yet-sent) rows. Rows that were created or skipped as duplicates are
 * never sent again.
 */
export function useContactImport() {
  const [phase, setPhase] = useState<ImportPhase>("upload");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedImportFile | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>([]);
  const [splitMode, setSplitMode] = useState<NameSplitMode>("lastWord");
  const [rows, setRows] = useState<ImportRowState[]>([]);

  const [loadingFile, setLoadingFile] = useState(false);
  const [fileError, setFileError] = useState<ImportFileErrorState | null>(null);

  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);

  const [importing, setImporting] = useState(false);
  const [importFailed, setImportFailed] = useState(false);
  const [waitingForRateLimit, setWaitingForRateLimit] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const rowsRef = useRef<ImportRowState[]>([]);
  const runRef = useRef(0);
  const cancelRef = useRef(false);
  const validatingRef = useRef(false);
  const queuedRowsRef = useRef<Set<number>>(new Set());

  const commitRows = useCallback(
    (update: (current: ImportRowState[]) => ImportRowState[]) => {
      rowsRef.current = update(rowsRef.current);
      setRows(rowsRef.current);
    },
    [],
  );

  const patchRow = useCallback(
    (rowNumber: number, patch: (row: ImportRowState) => ImportRowState) => {
      commitRows((current) =>
        current.map((row) =>
          row.draft.rowNumber === rowNumber ? patch(row) : row,
        ),
      );
    },
    [commitRows],
  );

  /** Runs `call`, waiting and retrying when the API answers 429 (rate limit). */
  const withRateLimitRetry = useCallback(
    async <T>(call: () => Promise<T>, run: number): Promise<T> => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await call();
        } catch (error) {
          const limited =
            axios.isAxiosError(error) && error.response?.status === 429;

          if (
            !limited ||
            attempt >= MAX_RATE_LIMIT_RETRIES ||
            cancelRef.current ||
            run !== runRef.current
          ) {
            throw error;
          }

          setWaitingForRateLimit(true);
          await sleep(rateLimitWaitMs(error));
          setWaitingForRateLimit(false);
        }
      }
    },
    [],
  );

  /* ------------------------------- step 1: file ------------------------------- */

  const loadFile = useCallback(
    async (file: File, encoding?: ImportEncoding) => {
      const run = runRef.current;

      setLoadingFile(true);
      setFileError(null);

      try {
        const result = await parseImportFile(file, { encoding });

        if (run !== runRef.current) return;

        setSourceFile(file);
        setParsed(result);
        setMapping(autoDetectMapping(result.headers));
        setPhase("mapping");
      } catch (error) {
        if (run !== runRef.current) return;

        // A non-UTF-8 CSV keeps the file so the user can pick the encoding.
        if (error instanceof ImportFileError) {
          setSourceFile(error.code === "invalidEncoding" ? file : null);
          setFileError({ code: error.code, limit: error.limit });
        } else {
          setSourceFile(null);
          setFileError({ code: "readFailed" });
        }
      } finally {
        if (run === runRef.current) {
          setLoadingFile(false);
        }
      }
    },
    [],
  );

  /** Re-reads the same CSV with another encoding (when the text looks garbled). */
  const changeEncoding = useCallback(
    (encoding: ImportEncoding) =>
      sourceFile ? loadFile(sourceFile, encoding) : undefined,
    [loadFile, sourceFile],
  );

  /* ------------------------------- step 2: mapping ------------------------------- */

  const setColumn = useCallback((column: number, field: ImportField | null) => {
    setMapping((current) => setColumnField(current, column, field));
  }, []);

  /* -------------------------------- step 3: review -------------------------------- */

  const runValidation = useCallback(
    async (rowNumbers: number[]) => {
      const run = runRef.current;
      const wanted = new Set(rowNumbers);
      const targets = rowsRef.current.filter((row) =>
        wanted.has(row.draft.rowNumber),
      );

      setChecking(true);

      let failed = false;

      for (const chunk of chunkRows(targets.map((row) => row.draft))) {
        if (run !== runRef.current || cancelRef.current) {
          break;
        }

        try {
          const result = await withRateLimitRetry(
            () => validateContactImport(chunk.map(toRequestRow)),
            run,
          );

          if (run !== runRef.current) {
            break;
          }

          for (const item of result.rows) {
            const draft = chunk[item.index];

            if (!draft) continue;

            patchRow(draft.rowNumber, (row) => ({
              ...row,
              check: item.status,
              checkIssues: item.errors,
              checkWarnings: item.warnings,
              checkDuplicateReason: item.duplicateReason,
            }));
          }
        } catch {
          failed = true;
          break;
        }
      }

      if (run === runRef.current) {
        setChecking(false);
        setCheckFailed(failed);
      }
    },
    [patchRow, withRateLimitRetry],
  );

  const continueToReview = useCallback(() => {
    if (!parsed) return;

    cancelRef.current = false;

    const drafts = buildImportRows(parsed, mapping, { splitMode });
    commitRows(() => drafts.map(createRowState));
    setCheckFailed(false);
    setImportFailed(false);
    setPhase("review");

    void runValidation(drafts.map((draft) => draft.rowNumber));
  }, [commitRows, mapping, parsed, runValidation, splitMode]);

  /** Re-checks the rows whose validation did not complete. */
  const retryCheck = useCallback(() => {
    cancelRef.current = false;
    setCheckFailed(false);

    void runValidation(
      rowsRef.current
        .filter((row) => row.check === "unchecked")
        .map((row) => row.draft.rowNumber),
    );
  }, [runValidation]);

  /** Manual correction of a name in the preview; the row is validated again by the server. */
  const editRowName = useCallback(
    (rowNumber: number, patch: { firstName?: string; lastName?: string }) => {
      patchRow(rowNumber, (row) => ({
        ...row,
        draft: updateDraftName(row.draft, patch),
        check: "unchecked",
        checkIssues: [],
        checkWarnings: [],
        checkDuplicateReason: undefined,
      }));

      // Edits made close together are validated in one go, one request at a time.
      queuedRowsRef.current.add(rowNumber);

      if (validatingRef.current) {
        return;
      }

      validatingRef.current = true;

      void (async () => {
        try {
          while (queuedRowsRef.current.size > 0) {
            const batch = [...queuedRowsRef.current];
            queuedRowsRef.current.clear();
            await runValidation(batch);
          }
        } finally {
          validatingRef.current = false;
        }
      })();
    },
    [patchRow, runValidation],
  );

  /* -------------------------------- step 4: import -------------------------------- */

  /**
   * Imports every valid row that was not sent yet, plus rows whose previous
   * attempt failed. Safe to call again after a failure or a cancel.
   */
  const startImport = useCallback(async () => {
    const run = runRef.current;
    const toSend = new Set(
      deriveRows(rowsRef.current)
        .filter((row) => row.kind === "valid" || row.kind === "failed")
        .map((row) => row.rowNumber),
    );

    if (toSend.size === 0) {
      setPhase("result");
      return;
    }

    cancelRef.current = false;
    setImporting(true);
    setImportFailed(false);
    setProgress({ done: 0, total: toSend.size });
    setPhase("result");

    const targets = rowsRef.current.filter((row) =>
      toSend.has(row.draft.rowNumber),
    );

    for (const chunk of chunkRows(targets.map((row) => row.draft))) {
      if (run !== runRef.current || cancelRef.current) {
        break;
      }

      try {
        const result = await withRateLimitRetry(
          () => importContacts(chunk.map(toRequestRow)),
          run,
        );

        if (run !== runRef.current) {
          return;
        }

        const reported = new Set<number>();

        for (const item of result.rows) {
          const draft = chunk[item.index];

          if (!draft) continue;

          reported.add(draft.rowNumber);
          patchRow(draft.rowNumber, (row) => ({
            ...row,
            outcome: item.outcome,
            outcomeIssues: item.errors,
          }));
        }

        // A row the server did not answer for is treated as failed, never as created.
        for (const draft of chunk) {
          if (!reported.has(draft.rowNumber)) {
            patchRow(draft.rowNumber, (row) => ({
              ...row,
              outcome: "failed",
              outcomeIssues: [
                { field: "row", code: "requestFailed", message: "No result." },
              ],
            }));
          }
        }
      } catch (error) {
        if (run !== runRef.current) {
          return;
        }

        const issue = requestFailureIssue(error);

        // The whole chunk is unknown (the answer may have been lost): mark it
        // failed. Retrying is safe — rows with an email come back as duplicates.
        for (const draft of chunk) {
          patchRow(draft.rowNumber, (row) => ({
            ...row,
            outcome: "failed",
            outcomeIssues: [issue],
          }));
        }

        setImportFailed(true);
        break;
      }

      setProgress((current) => ({
        ...current,
        done: current.done + chunk.length,
      }));
    }

    if (run === runRef.current) {
      setImporting(false);
    }
  }, [patchRow, withRateLimitRetry]);

  /** Stops after the request that is already in flight. */
  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  /* ----------------------------------- misc ----------------------------------- */

  const goTo = useCallback((next: ImportPhase) => {
    if (next === "upload" || next === "mapping") {
      cancelRef.current = true;
    }

    setPhase(next);
  }, []);

  const reset = useCallback(() => {
    runRef.current += 1;
    cancelRef.current = true;
    validatingRef.current = false;
    queuedRowsRef.current.clear();
    rowsRef.current = [];

    setPhase("upload");
    setSourceFile(null);
    setParsed(null);
    setMapping([]);
    setSplitMode("lastWord");
    setRows([]);
    setLoadingFile(false);
    setFileError(null);
    setChecking(false);
    setCheckFailed(false);
    setImporting(false);
    setImportFailed(false);
    setWaitingForRateLimit(false);
    setProgress({ done: 0, total: 0 });
  }, []);

  const derived = useMemo(() => deriveRows(rows), [rows]);
  const counts = useMemo(() => countRows(derived), [derived]);

  return {
    phase,
    parsed,
    mapping,
    splitMode,
    derived,
    counts,

    loadingFile,
    fileError,
    canChooseEncoding:
      fileError?.code === "invalidEncoding" && sourceFile !== null,

    checking,
    checkFailed,

    importing,
    importFailed,
    waitingForRateLimit,
    progress,

    loadFile,
    changeEncoding,
    setColumn,
    setSplitMode,
    continueToReview,
    retryCheck,
    editRowName,
    startImport,
    cancel,
    goTo,
    reset,
  };
}

import {
  collectPrintTimeKeys,
  formatPrintTime,
  isBreakishTitle,
  PRINT_DAY_HEADERS,
  type AsaPrintColumn,
} from "@/lib/asa-weekly-schedule-print";

type AsaWeeklySchedulePrintSheetProps = {
  title: string;
  weekRange: string;
  columns: AsaPrintColumn[];
  emptyMessage?: string;
};

export function AsaWeeklySchedulePrintSheet({
  title,
  weekRange,
  columns,
  emptyMessage = "No lesson blocks for this week.",
}: AsaWeeklySchedulePrintSheetProps) {
  const timeKeys = collectPrintTimeKeys(columns);

  return (
    <>
      <div className="schedule-print-root" data-testid="schedule-print-root" aria-hidden="true">
        <div className="asa-print-sheet">
          <div className="asa-print-brand-row">
            <div className="asa-print-brand-mark">
              <span className="asa-print-brand-line1">AMERICAN SEEKERS</span>
              <span className="asa-print-brand-line2">Academy</span>
            </div>
          </div>
          <h1 className="asa-print-title">{title}</h1>
          <div className="asa-print-week-rule" />
          <p className="asa-print-week-label">WEEK OF {weekRange.toUpperCase()}</p>

          {columns.length === 0 || timeKeys.length === 0 ? (
            <p className="asa-print-empty">{emptyMessage}</p>
          ) : (
            <table className="asa-print-table">
              <thead>
                <tr>
                  <th className="asa-print-th-time">Time</th>
                  {columns.map((col, idx) => {
                    const style = PRINT_DAY_HEADERS[idx % PRINT_DAY_HEADERS.length];
                    return (
                      <th
                        key={`${col.dayName}-${idx}`}
                        style={{
                          background: style.background,
                          color: style.color,
                          borderColor: style.background === "#ffffff" ? "#111111" : style.background,
                        }}
                      >
                        {col.dayName.toUpperCase()}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {timeKeys.map((timeKey) => {
                  const rowBlocks = columns.map((col) => col.blocksByTime.get(timeKey));
                  const breakRow = rowBlocks.some((block) => block && isBreakishTitle(block.title));
                  return (
                    <tr key={timeKey} className={breakRow ? "asa-print-row-break" : undefined}>
                      <td className="asa-print-td-time">{formatPrintTime(timeKey)}</td>
                      {columns.map((col, idx) => {
                        const block = col.blocksByTime.get(timeKey);
                        return (
                          <td key={`${col.dayName}-${idx}-${timeKey}`} className="asa-print-td-cell">
                            {block ? (
                              <div className="asa-print-cell-inner">
                                <div className="asa-print-cell-title">{block.title}</div>
                                {Array.isArray(block.objectives) && block.objectives[0] && (
                                  <div className="asa-print-cell-sub">{block.objectives[0]}</div>
                                )}
                                {block.lessonLink && (
                                  <div className="asa-print-cell-link">{block.lessonLink}</div>
                                )}
                              </div>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <style>{`
        .schedule-print-root {
          display: none !important;
        }

        @media print {
          @page {
            size: letter portrait;
            margin: 0.4in 0.35in;
          }

          html, body {
            height: auto !important;
            overflow: visible !important;
            background: white !important;
          }

          body * {
            visibility: hidden !important;
          }

          .schedule-print-root,
          .schedule-print-root * {
            visibility: visible !important;
          }

          .schedule-print-root {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0 !important;
            color: #111;
            font-family: Georgia, "Times New Roman", Times, serif;
          }

          .no-print,
          nav,
          aside,
          header,
          footer,
          [data-radix-portal],
          [role="dialog"],
          [role="navigation"] {
            display: none !important;
            visibility: hidden !important;
          }

          .asa-print-sheet {
            width: 100%;
          }

          .asa-print-brand-row {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 0.15rem;
          }

          .asa-print-brand-mark {
            text-align: right;
            line-height: 1.05;
          }

          .asa-print-brand-line1 {
            display: block;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 9px;
            font-weight: 800;
            letter-spacing: 0.04em;
            color: #004B87;
          }

          .asa-print-brand-line2 {
            display: block;
            font-family: Georgia, "Times New Roman", Times, serif;
            font-size: 14px;
            font-style: italic;
            color: #C02D2E;
          }

          .asa-print-title {
            text-align: center;
            font-family: Georgia, "Times New Roman", Times, serif;
            font-size: 28px;
            font-style: italic;
            font-weight: 700;
            color: #C02D2E;
            margin: 0.1rem 0 0.25rem;
            line-height: 1.1;
          }

          .asa-print-week-rule {
            border-top: 1px solid #94a3b8;
            margin: 0.15rem 0 0.35rem;
          }

          .asa-print-week-label {
            text-align: center;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 12px;
            font-weight: 800;
            letter-spacing: 0.06em;
            margin: 0 0 0.45rem;
            color: #111;
          }

          .asa-print-empty {
            text-align: center;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 11px;
            color: #64748b;
          }

          .asa-print-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            font-family: Arial, Helvetica, sans-serif;
          }

          .asa-print-table th,
          .asa-print-table td {
            border: 1px solid #94a3b8;
            vertical-align: top;
            padding: 3px 4px;
          }

          .asa-print-th-time,
          .asa-print-table thead th:first-child {
            width: 12%;
            background: #111111 !important;
            color: #ffffff !important;
            font-size: 10px;
            font-weight: 800;
            text-align: center;
            vertical-align: middle;
          }

          .asa-print-table thead th:not(:first-child) {
            width: auto;
            font-size: 11px;
            font-weight: 800;
            text-align: center;
            letter-spacing: 0.03em;
            padding: 5px 4px;
          }

          .asa-print-td-time {
            width: 12%;
            font-size: 9px;
            font-weight: 800;
            text-align: center;
            vertical-align: middle !important;
            white-space: nowrap;
            background: #fff;
          }

          .asa-print-td-cell {
            font-size: 8px;
            line-height: 1.2;
            text-align: center;
          }

          .asa-print-cell-inner {
            display: flex;
            flex-direction: column;
            gap: 1px;
            align-items: center;
          }

          .asa-print-cell-title {
            font-weight: 700;
            color: #111;
            max-width: 100%;
          }

          .asa-print-cell-sub {
            font-weight: 400;
            color: #334155;
            font-size: 7.5px;
          }

          .asa-print-cell-link {
            color: #1d4ed8;
            text-decoration: underline;
            font-size: 7px;
            word-break: break-all;
          }

          .asa-print-row-break td:not(.asa-print-td-time) {
            background: #e5e7eb !important;
          }

          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </>
  );
}

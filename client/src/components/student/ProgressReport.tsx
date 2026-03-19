import { format } from "date-fns";
import { displayScoreWithMax } from "@/lib/assessmentUtils";

interface AssessmentRecord {
  id: number;
  assessmentTypeName: string;
  assessmentTypeCategory: string;
  score: string | null;
  scoreFormat: string | null;
  maxScore: number | null;
  levelOptions: string[] | null;
  assessmentDate: string;
  lexileScore?: number | null;
  curriculumBookName?: string | null;
  notes?: string | null;
}

interface AttendanceRecord {
  id: number;
  status: string;
  sessionDate: string;
  tardyMinutes?: number | null;
  earlyDepartureMinutes?: number | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  notes?: string | null;
  className?: string | null;
}

interface ProgressReportProps {
  studentName: string;
  gradeLevel?: string;
  className?: string;
  assessments: AssessmentRecord[];
  attendance: AttendanceRecord[];
  schoolName?: string;
  reportDate?: string;
}

/**
 * Printable Progress Report component.
 * Intended to be included in the DOM but hidden (via `hidden print:block` classes),
 * so it only appears when the user triggers window.print().
 * Alternatively, it can be rendered directly inside a print dialog.
 */
export default function ProgressReport({
  studentName,
  gradeLevel,
  className,
  assessments,
  attendance,
  schoolName,
  reportDate,
}: ProgressReportProps) {
  const printDate = reportDate || format(new Date(), 'MMMM d, yyyy');

  // Attendance summary
  const totalSessions = attendance.length;
  const presentCount = attendance.filter(a => a.status === 'present').length;
  const absentCount = attendance.filter(a => a.status === 'absent').length;
  const lateCount = attendance.filter(a => a.status === 'late').length;
  const excusedCount = attendance.filter(a => a.status === 'excused').length;
  const earlyDepartureCount = attendance.filter(a => a.status === 'early_departure').length;
  const attendanceRate = totalSessions > 0
    ? Math.round((presentCount / totalSessions) * 100)
    : null;

  return (
    <div className="font-sans text-black bg-white p-8 max-w-4xl mx-auto print:p-0">
      {/* Header */}
      <div className="border-b-2 border-black pb-4 mb-6">
        <div className="flex justify-between items-start">
          <div>
            {schoolName && (
              <p className="text-sm text-gray-600 mb-1">{schoolName}</p>
            )}
            <h1 className="text-2xl font-bold">Student Progress Report</h1>
          </div>
          <div className="text-right text-sm text-gray-600">
            <p>Date Generated: {printDate}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="font-semibold">Student: </span>
            <span>{studentName}</span>
          </div>
          {gradeLevel && (
            <div>
              <span className="font-semibold">Grade Level: </span>
              <span>{gradeLevel}</span>
            </div>
          )}
          {className && (
            <div>
              <span className="font-semibold">Class: </span>
              <span>{className}</span>
            </div>
          )}
        </div>
      </div>

      {/* Attendance Summary */}
      <section className="mb-8">
        <h2 className="text-lg font-bold border-b border-gray-300 pb-2 mb-4">Attendance Summary</h2>
        {totalSessions === 0 ? (
          <p className="text-gray-500 text-sm">No attendance records available.</p>
        ) : (
          <>
            <div className="grid grid-cols-5 gap-2 mb-4 text-center">
              <div className="border rounded p-2">
                <div className="text-xl font-bold text-green-700">{presentCount}</div>
                <div className="text-xs text-gray-600">Present</div>
              </div>
              <div className="border rounded p-2">
                <div className="text-xl font-bold text-red-700">{absentCount}</div>
                <div className="text-xs text-gray-600">Absent</div>
              </div>
              <div className="border rounded p-2">
                <div className="text-xl font-bold text-yellow-700">{lateCount}</div>
                <div className="text-xs text-gray-600">Late</div>
              </div>
              <div className="border rounded p-2">
                <div className="text-xl font-bold text-blue-700">{excusedCount}</div>
                <div className="text-xs text-gray-600">Excused</div>
              </div>
              <div className="border rounded p-2">
                <div className="text-xl font-bold text-orange-700">{earlyDepartureCount}</div>
                <div className="text-xs text-gray-600">Early Departure</div>
              </div>
            </div>
            {attendanceRate !== null && (
              <p className="text-sm">
                <span className="font-semibold">Overall Attendance Rate: </span>
                <span className={attendanceRate >= 80 ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>
                  {attendanceRate}%
                </span>
                <span className="text-gray-500 ml-2">({presentCount} of {totalSessions} sessions)</span>
              </p>
            )}

            {/* Attendance records table */}
            <table className="w-full text-sm border-collapse mt-4">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-2 py-1 text-left">Date</th>
                  <th className="border border-gray-300 px-2 py-1 text-left">Class</th>
                  <th className="border border-gray-300 px-2 py-1 text-left">Status</th>
                  <th className="border border-gray-300 px-2 py-1 text-left">Minutes</th>
                  <th className="border border-gray-300 px-2 py-1 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {attendance.slice(0, 30).map((record, i) => {
                  let minutesNote = '';
                  if (record.status === 'late' && record.tardyMinutes) {
                    minutesNote = `${record.tardyMinutes} min late`;
                  } else if (record.status === 'early_departure' && record.earlyDepartureMinutes) {
                    minutesNote = `Left ${record.earlyDepartureMinutes} min early`;
                  }
                  return (
                  <tr key={i} className={i % 2 === 0 ? '' : 'bg-gray-50'}>
                    <td className="border border-gray-300 px-2 py-1">
                      {record.sessionDate
                        ? format(new Date(record.sessionDate), 'MMM d, yyyy')
                        : '—'}
                    </td>
                    <td className="border border-gray-300 px-2 py-1">{record.className || '—'}</td>
                    <td className="border border-gray-300 px-2 py-1 capitalize">
                      {(record.status || '').replace(/_/g, ' ')}
                    </td>
                    <td className="border border-gray-300 px-2 py-1 text-gray-600">
                      {minutesNote || '—'}
                    </td>
                    <td className="border border-gray-300 px-2 py-1 text-gray-600">
                      {record.notes || '—'}
                    </td>
                  </tr>
                  );
                })}
                {attendance.length > 30 && (
                  <tr>
                    <td colSpan={5} className="border border-gray-300 px-2 py-1 text-center text-gray-500 italic">
                      ... and {attendance.length - 30} more records
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </section>

      {/* Assessment History */}
      <section>
        <h2 className="text-lg font-bold border-b border-gray-300 pb-2 mb-4">Assessment History</h2>
        {assessments.length === 0 ? (
          <p className="text-gray-500 text-sm">No assessments recorded yet.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-2 py-1 text-left">Date</th>
                <th className="border border-gray-300 px-2 py-1 text-left">Type</th>
                <th className="border border-gray-300 px-2 py-1 text-left">Book / Lesson</th>
                <th className="border border-gray-300 px-2 py-1 text-left">Score</th>
                <th className="border border-gray-300 px-2 py-1 text-left">Lexile</th>
                <th className="border border-gray-300 px-2 py-1 text-left">Notes</th>
              </tr>
            </thead>
            <tbody>
              {assessments.map((a, i) => (
                <tr key={a.id ?? i} className={i % 2 === 0 ? '' : 'bg-gray-50'}>
                  <td className="border border-gray-300 px-2 py-1">
                    {a.assessmentDate
                      ? format(new Date(a.assessmentDate), 'MMM d, yyyy')
                      : '—'}
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    {a.assessmentTypeName}
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    {a.curriculumBookName || '—'}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 font-medium">
                    {displayScoreWithMax(
                      a.score,
                      a.scoreFormat,
                      a.levelOptions,
                      a.maxScore
                    )}
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    {a.lexileScore != null ? `${a.lexileScore}L` : '—'}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-gray-600">
                    {a.notes || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-gray-300 text-xs text-gray-500 flex justify-between">
        <span>Generated by ASA Learning Platform</span>
        <span>{printDate}</span>
      </div>
    </div>
  );
}

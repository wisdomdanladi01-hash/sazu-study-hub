import { useState, useRef } from 'react';
import { adminService, type CsvImportResult } from '@/services/admin';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import {
  FileSpreadsheet,
  Upload,
  Download,
  RotateCcw,
  HelpCircle,
} from 'lucide-react';

const CSV_TEMPLATE_CONTENT = `programme_code,course_code,course_title,level_code,academic_session,semester,credit_units,department_code,curriculum_version,course_type,verification_status,source_note
BSC-COMPUTER-SCIENCE,CSC202,Computer Programming II,200,2024/2025,2,3,MATHEMATICAL-SCIENCES,2024/2025 Curriculum,compulsory,user_supplied,Transcribed from registration sheet
BSC-COMPUTER-SCIENCE,CSC204,Computer Architecture & Organization I,200,2024/2025,2,2,MATHEMATICAL-SCIENCES,2024/2025 Curriculum,compulsory,user_supplied,Transcribed from registration sheet
`;

export function AdminCsvImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE_CONTENT], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'course_offerings_template.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleFileSelect = (selectedFile: File) => {
    setError(null);
    setResult(null);

    if (!selectedFile.name.endsWith('.csv') && selectedFile.type !== 'text/csv') {
      setError('Please select a valid CSV file (.csv).');
      return;
    }

    if (selectedFile.size > 2 * 1024 * 1024) {
      setError('File size exceeds the 2 MB limit.');
      return;
    }

    setFile(selectedFile);

    // Read first few rows for client preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result || '');
      const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 6);
      const parsed = lines.map((l) => l.split(',').map((s) => s.trim()));
      setPreviewRows(parsed);
    };
    reader.readAsText(selectedFile);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const res = await adminService.importCourseOfferings(file);
      setResult(res);
      setFile(null);
      setPreviewRows([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'CSV import failed.');
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreviewRows([]);
    setError(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-950">Bulk Import Course Offerings</h1>
          <p className="mt-1 text-sm text-ink-600">
            Import verified or user-supplied course offerings in bulk using UTF-8 CSV files.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={downloadTemplate} leftIcon={<Download className="h-4 w-4" />}>
          Download CSV template
        </Button>
      </div>

      {result && (
        <Alert tone="success" title="Import Completed Successfully">
          <p className="text-sm">
            Imported <strong>{result.created_offerings_count}</strong> course offering records into curriculum version{' '}
            <strong>{result.curriculum_version}</strong>. All foreign-key relationships and unique constraints were verified.
          </p>
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={reset}>Import another file</Button>
          </div>
        </Alert>
      )}

      {error && (
        <Alert tone="error" title="Import Failed — Atomic Rollback Enforced">
          <p className="text-sm">{error}</p>
          <p className="text-xs text-red-600 mt-2">
            No partial rows were written to the database. Fix the formatting or reference errors in the CSV and try again.
          </p>
        </Alert>
      )}

      {/* Upload Zone */}
      <Card className="p-6 sm:p-8">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${dragOver ? 'border-teal-500 bg-teal-50/50' : 'border-ink-200 bg-ink-50/50 hover:border-ink-300'
            }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            accept=".csv,text/csv"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            className="hidden"
            id="csv-file-input"
          />
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-100 text-teal-700">
            <Upload className="h-6 w-6" />
          </div>
          <h2 className="font-display text-base font-bold text-ink-950">
            {file ? file.name : 'Choose a CSV file or drag and drop here'}
          </h2>
          <p className="mt-1 text-xs text-ink-500">
            {file ? `${(file.size / 1024).toFixed(1)} KB` : 'UTF-8 encoded CSV up to 2 MB (maximum 2,000 rows)'}
          </p>

          <div className="mt-5 flex justify-center gap-3">
            <label htmlFor="csv-file-input">
              <Button type="button" size="sm" variant="outline" leftIcon={<FileSpreadsheet className="h-4 w-4" />}>
                {file ? 'Change file' : 'Select file'}
              </Button>
            </label>
            {file && (
              <Button type="button" size="sm" onClick={handleImport} loading={uploading} leftIcon={<Upload className="h-4 w-4" />}>
                Submit import
              </Button>
            )}
          </div>
        </div>

        {/* Client File Preview */}
        {previewRows.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase text-ink-600">CSV Preview (First 5 Rows)</span>
              <button onClick={reset} className="text-xs text-red-600 hover:underline inline-flex items-center gap-1">
                <RotateCcw className="h-3 w-3" /> Clear file
              </button>
            </div>
            <div className="overflow-x-auto border border-ink-200 rounded-xl">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-ink-100 border-b border-ink-200">
                  <tr>
                    {previewRows[0].map((header, idx) => (
                      <th key={idx} className="px-3 py-2 text-ink-800 font-bold whitespace-nowrap">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 bg-white">
                  {previewRows.slice(1).map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-ink-50">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-3 py-2 text-ink-700 whitespace-nowrap">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      {/* Format & Specification Guide */}
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <HelpCircle className="h-5 w-5 text-teal-600 mt-0.5 shrink-0" />
          <div className="space-y-3 text-sm text-ink-700">
            <h3 className="font-display font-bold text-ink-950">Import Rules &amp; Column Specifications</h3>
            <div className="grid sm:grid-cols-2 gap-4 text-xs">
              <div>
                <p className="font-bold text-ink-900 mb-1">Required Columns:</p>
                <ul className="list-disc list-inside space-y-1 text-ink-600">
                  <li><code className="font-mono font-bold">programme_code</code>: Stable code (e.g. BSC-COMPUTER-SCIENCE)</li>
                  <li><code className="font-mono font-bold">course_code</code>: Course code (e.g. CSC202)</li>
                  <li><code className="font-mono font-bold">course_title</code>: Official title of the course</li>
                  <li><code className="font-mono font-bold">level_code</code>: Academic level (100, 200, 300, etc.)</li>
                  <li><code className="font-mono font-bold">academic_session</code>: Session string (e.g. 2024/2025)</li>
                  <li><code className="font-mono font-bold">semester</code>: 1 or 2</li>
                  <li><code className="font-mono font-bold">credit_units</code>: Integer units (1 to 12)</li>
                </ul>
              </div>
              <div>
                <p className="font-bold text-ink-900 mb-1">Optional Columns:</p>
                <ul className="list-disc list-inside space-y-1 text-ink-600">
                  <li><code className="font-mono">department_code</code>: Department code (e.g. MATHEMATICAL-SCIENCES)</li>
                  <li><code className="font-mono">curriculum_version</code>: e.g. 2024/2025 Curriculum</li>
                  <li><code className="font-mono">course_type</code>: compulsory, elective, or general</li>
                  <li><code className="font-mono">verification_status</code>: verified, user_supplied, pending_confirmation</li>
                  <li><code className="font-mono">source_note</code>: Attribution note / registration form reference</li>
                </ul>
              </div>
            </div>
            <div className="pt-2 border-t border-ink-100 text-xs text-ink-500">
              Note: If any single row fails foreign key resolution or unique constraint verification, the complete import is rolled back to prevent inconsistent curriculum states.
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

import hashlib
import importlib.util
import json
import pathlib
import tempfile
import unittest
import zipfile
from unittest.mock import patch


MODULE_PATH = pathlib.Path(__file__).with_name("kernel.py")
spec = importlib.util.spec_from_file_location("clinical_audit_test_kernel", MODULE_PATH)
kernel = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kernel)


class ClinicalDataAuditTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def workbook(self, body, shared=None):
        path = self.root / "cohort.xlsx"
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr("xl/workbook.xml", '<workbook xmlns="' + kernel._MAIN_NS + '" xmlns:r="' + kernel._REL_NS + '"><sheets><sheet name="コホート" sheetId="1" r:id="rId1"/></sheets></workbook>')
            archive.writestr("xl/_rels/workbook.xml.rels", '<Relationships xmlns="' + kernel._PKG_REL_NS + '"><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="' + kernel._REL_NS + '/worksheet"/></Relationships>')
            archive.writestr("xl/worksheets/sheet1.xml", '<worksheet xmlns="' + kernel._MAIN_NS + '"><sheetData>' + body + '</sheetData></worksheet>')
            if shared is not None:
                archive.writestr("xl/sharedStrings.xml", '<sst xmlns="' + kernel._MAIN_NS + '">' + shared + '</sst>')
        return path

    def assert_unchanged(self, path, operation):
        before = hashlib.sha256(path.read_bytes()).hexdigest()
        result = operation(path)
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), before)
        self.assertTrue(result["read_only"])
        self.assertFalse(result["source_modified"])
        return result

    def test_utf8_bom_and_cp932_without_optional_packages(self):
        import builtins
        original_import = builtins.__import__

        def reject_optional(name, *args, **kwargs):
            if name.split(".")[0] in ("pandas", "openpyxl"):
                raise ImportError("optional dependencies intentionally unavailable")
            return original_import(name, *args, **kwargs)

        for encoding in ("utf-8-sig", "cp932"):
            path = self.root / (encoding + ".csv")
            path.write_text("患者ID,所見\r\n1,秘密の患者値\r\n2,正常\r\n", encoding=encoding, newline="")
            with patch("builtins.__import__", side_effect=reject_optional):
                report = self.assert_unchanged(path, kernel.inspect_dataset)
            self.assertEqual(report["worksheets"][0]["headers"], ["患者ID", "所見"])
            self.assertEqual(report["worksheets"][0]["data_rows"], 2)
            self.assertNotIn("秘密の患者値", json.dumps(report, ensure_ascii=False))

    def test_tsv_is_not_reinterpreted_by_punctuation_in_single_column_values(self):
        path = self.root / "notes.tsv"
        path.write_text('所見\n"A;B"\n"C;D"\n', encoding="utf-8")
        table = kernel._load_tables(path)[0]
        self.assertEqual(table["column_count"], 1)
        self.assertEqual(table["rows"][0]["values"], ["A;B"])

    def test_ragged_csv_preserves_extra_columns_and_physical_source_rows(self):
        path = self.root / "quoted.csv"
        path.write_text('id,note\n1,"first\nsecond"\n2,x,extra\n', encoding="utf-8", newline="")
        table = kernel._load_tables(path)[0]
        self.assertEqual(table["headers"], ["id", "note", None])
        self.assertEqual([row["source_row"] for row in table["rows"]], [2, 4])
        self.assertEqual(table["rows"][0]["values"], ["1", "first\nsecond", None])

    def test_xlsx_shared_inline_formula_and_sparse_cells_are_read_only(self):
        path = self.workbook(
            '<row r="2"><c r="A2" t="s"><v>0</v></c><c r="B2" t="inlineStr"><is><t>ratio</t></is></c><c r="C2" t="inlineStr"><is><t>event</t></is></c></row>'
            '<row r="3"><c r="A3" t="inlineStr"><is><t>秘密の患者値</t></is></c><c r="B3"><f>2/1</f><v>2</v></c><c r="C3" t="b"><v>1</v></c></row>'
            '<row r="5"><c r="B5"><f>2/0</f></c></row>',
            '<si><r><t>患者</t></r><r><t>ID</t></r></si>'
        )
        table = kernel._load_tables(path)[0]
        self.assertEqual(table["headers"], ["患者ID", "ratio", "event"])
        self.assertEqual(table["rows"][0]["values"], ["秘密の患者値", 2, True])
        self.assertEqual(table["rows"][1]["values"], [None, {"formula_without_cached_value": "2/0"}, None])
        report = self.assert_unchanged(path, kernel.inspect_dataset)
        self.assertEqual(report["selected_sheet"], "コホート")
        self.assertEqual(report["worksheets"][0]["data_rows"], 2)
        self.assertNotIn("秘密の患者値", json.dumps(report, ensure_ascii=False))

    def test_corrupt_shared_string_is_reported_instead_of_becoming_a_missing_value(self):
        for index in (-1, 9):
            path = self.workbook('<row r="1"><c r="A1" t="s"><v>' + str(index) + '</v></c></row>', '<si><t>id</t></si>')
            with self.assertRaisesRegex(ValueError, "missing shared string"):
                kernel.inspect_dataset(path)

    def test_malformed_workbook_indices_fail_before_dense_allocation(self):
        for body, message in (
            ('<row r="1"><c r="ZZZZZZZZZZ1"><v>1</v></c></row>', "column index"),
            ('<row r="999999999"><c r="A999999999"><v>1</v></c></row>', "row index"),
            ('<row r="1"><c r="A1"><v>1</v></c></row><row r="1"><c r="A1"><v>2</v></c></row>', "duplicate row")
        ):
            with self.assertRaisesRegex(ValueError, message):
                kernel.inspect_dataset(self.workbook(body))

    def test_cell_limits_cover_padding_as_well_as_nonempty_cells(self):
        path = self.workbook('<row r="1"><c r="A1"><v>1</v></c></row><row r="2"><c r="D2"><v>2</v></c></row>')
        with patch.object(kernel, "_MAX_TABLE_CELLS", 6):
            with self.assertRaisesRegex(ValueError, "cell audit limit"):
                kernel.inspect_dataset(path)
        path = self.root / "cohort.csv"
        path.write_text("id,value\n1,2\n3,4,extra\n", encoding="utf-8")
        with patch.object(kernel, "_MAX_TABLE_CELLS", 6):
            with self.assertRaisesRegex(ValueError, "cell audit limit"):
                kernel.inspect_dataset(path)

    def test_120_by_18_cohort_reports_measured_checks_without_mutating_data(self):
        import csv
        path = self.root / "synthetic.csv"
        headers = ["patient_id", "data_origin", "neutrophils", "lymphocytes", "baseline_nlr_ratio", "event", "event_time", "followup"] + ["covariate_" + str(n) for n in range(10)]
        with path.open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.writer(stream)
            writer.writerow(headers)
            for n in range(120):
                writer.writerow([str(n if n < 119 else 118), "SYNTHETIC", 6, 2, 3.3 if n == 0 else 3, 1, 12, 10] + ["" if n == 0 and index == 0 else n for index in range(10)])
        before = path.read_bytes()
        report = kernel.audit_synthetic_cohort(path, event_column="event", event_time_column="event_time", followup_time_column="followup")
        self.assertEqual(path.read_bytes(), before)
        self.assertEqual((report["rows"], report["columns"]), (120, 18))
        self.assertEqual(report["duplicate_identifier_check"]["duplicate_count"], 1)
        self.assertEqual(report["missingness"]["missing_cells"], 1)
        self.assertEqual(report["nlr_check"]["mismatch_count"], 1)
        self.assertEqual(report["data_origin_check"]["status"], "pass")
        self.assertEqual(report["event_time_check"]["status"], "pass")
        self.assertTrue(all(value is False for value in report["actions_taken"].values()))


if __name__ == "__main__":
    unittest.main()

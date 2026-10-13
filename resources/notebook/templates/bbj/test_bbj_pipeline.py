"""Synthetic fixtures only; these tests are not BBJ research results."""
import csv
import json
import math
import tempfile
import unittest
from pathlib import Path
from bbj_pipeline import Chain, Fasta, normalize, prepare, panel_frequencies, download, run, digest

class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name)
    def tearDown(self):
        self.tmp.cleanup()
    def chain(self, body):
        path = self.path / "test.chain"
        path.write_text(body)
        return Chain(path)
    def test_chain_one_based_and_gap(self):
        chain = self.chain("chain 1 chr1 100 + 10 22 chr1 200 + 20 33 1\n5 2 3\n5\n")
        self.assertEqual(chain.map("1", 11), ("1", 21, "+"))
        self.assertEqual(chain.map("1", 22), ("1", 33, "+"))
        with self.assertRaisesRegex(ValueError, "unmapped"):
            chain.map("1", 16)
    def test_reverse_strand(self):
        chain = self.chain("chain 1 chr1 100 + 10 15 chr1 200 - 20 25 1\n5\n")
        self.assertEqual(chain.map("1", 11), ("1", 180, "-"))
        self.assertEqual(chain.map("1", 15), ("1", 176, "-"))
    def test_ambiguous_not_first_hit(self):
        body = "chain 1 chr1 100 + 10 15 chr1 200 + 20 25 1\n5\n"
        chain = self.chain(body + body)
        with self.assertRaisesRegex(ValueError, "multiple"):
            chain.map("1", 11)
    def row(self):
        return {"CHR":"1", "POS":"11", "REF":"A", "ALT":"C", "EA":"C", "OA":"A", "BETA":"2", "SE":"0.2", "P":"0.001", "EAF":"0.2"}
    def test_OR_and_invalid_statistics(self):
        row = self.row()
        mapping = {key:key for key in row}
        self.assertAlmostEqual(normalize(row, mapping, "OR")["BETA"], math.log(2))
        for field, value in [("SE", "0"), ("BETA", "nan"), ("EAF", "2"), ("P", "0")]:
            bad = dict(row, **{field:value})
            with self.assertRaises(ValueError):
                normalize(bad, mapping, "beta")
    def test_allele_aware_multiallelic_AF_and_duplicates(self):
        path = self.path / "panel.vcf"
        path.write_text("1\t11\t.\tA\tC,G\t.\tPASS\tAF=0.2,0.3\n1\t12\t.\tA\tC\t.\tPASS\tAF=0.4\n1\t12\t.\tA\tC\t.\tPASS\tAF=0.5\n")
        keys = {("1",11,"A","C"),("1",11,"A","G"),("1",12,"A","C")}
        result = panel_frequencies(path, keys)
        self.assertEqual(result[("1",11,"A","C")], 0.2)
        self.assertEqual(result[("1",11,"A","G")], 0.3)
        self.assertIsNone(result[("1",12,"A","C")])
    def test_target_reference_and_complement_keep_effect_direction(self):
        fasta = self.path / "target.fa"
        fasta.write_bytes(b">chr1\n" + b"T" * 200 + b"\n")
        Path(str(fasta) + ".fai").write_text("chr1\t200\t6\t200\t201\n")
        source = self.path / "input.tsv"
        row = self.row()
        with source.open("w", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(row), delimiter="\t")
            writer.writeheader(); writer.writerow(row)
        chain = self.chain("chain 1 chr1 100 + 10 15 chr1 200 - 20 25 1\n5\n")
        reference = Fasta(fasta)
        spec = {"build":"GRCh37", "position_base":1, "alleles_reviewed":True, "path":source, "columns":{key:key for key in row}, "effect_scale":"beta"}
        try:
            rows, rejected = prepare(spec, "GRCh38", reference, chain)
            self.assertEqual(rejected, [])
            self.assertEqual((rows[0]["POS"], rows[0]["REF"], rows[0]["EA"], rows[0]["BETA"]), (180,"T","G",2))
        finally:
            reference.close()
    def test_download_does_not_accept_terms_or_arbitrary_origin(self):
        with self.assertRaisesRegex(ValueError, "terms"):
            download("https://jmorp.megabank.tohoku.ac.jp/file", self.path / "out")
        with self.assertRaisesRegex(ValueError, "origin"):
            download("https://evil.test/file", self.path / "out", True)
    def test_complete_preparation_and_manifest(self):
        fasta = self.path / "target.fa"
        fasta.write_bytes(b">chr1\n" + b"A" * 200 + b"\n")
        Path(str(fasta) + ".fai").write_text("chr1\t200\t6\t200\t201\n")
        source = self.path / "input.tsv"
        row = self.row()
        with source.open("w", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(row), delimiter="\t")
            writer.writeheader(); writer.writerow(row)
        spec = {"path": str(source), "build":"GRCh38", "position_base":1, "alleles_reviewed":True,
                "effect_scale":"beta", "columns":{key:key for key in row}}
        config = {"target_build":"GRCh38", "reference":{"path":str(fasta), "build":"GRCh38"}, "exposure":spec,"outcome":spec}
        destination = self.path / "prepared"
        manifest = run(config, destination)
        self.assertEqual(manifest["counts"]["exposure"], {"accepted":1,"rejected":0})
        self.assertEqual(manifest["outputs"]["exposure.tsv"], digest(destination / "exposure.tsv"))
        self.assertEqual(manifest["status"], "prepared; MR not executed")
        with self.assertRaises(FileExistsError):
            run(config, destination)
    def test_duplicate_variants_all_rejected(self):
        fasta = self.path / "target.fa"
        fasta.write_bytes(b">chr1\n" + b"A" * 200 + b"\n")
        Path(str(fasta) + ".fai").write_text("chr1\t200\t6\t200\t201\n")
        source = self.path / "input.tsv"
        row = self.row()
        with source.open("w", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(row), delimiter="\t")
            writer.writeheader(); writer.writerow(row); writer.writerow(row)
        spec = {"path":str(source),"build":"GRCh38","position_base":1,"alleles_reviewed":True,"effect_scale":"beta","columns":{key:key for key in row}}
        reference = Fasta(fasta)
        try:
            rows, rejected = prepare(spec, "GRCh38", reference)
            self.assertEqual(rows, [])
            self.assertEqual(len(rejected), 2)
        finally:
            reference.close()

if __name__ == "__main__":
    unittest.main()

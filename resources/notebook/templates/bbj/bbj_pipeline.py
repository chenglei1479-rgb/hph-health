"""BBJ preparation. Standard-library only; 1-based SNPs, audited GRCh37/38 mapping."""
import argparse
import csv
import gzip
import hashlib
import json
import math
from pathlib import Path
from urllib.parse import urlsplit

BUILDS = {"GRCh37", "GRCh38"}
COMPLEMENT = str.maketrans("ACGT", "TGCA")

def digest(path):
    h = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()

def textfile(path):
    return gzip.open(path, "rt") if str(path).endswith(".gz") else open(path, encoding="utf-8-sig")

def chrom(value):
    value = str(value).removeprefix("chr")
    value = {"23": "X", "24": "Y", "M": "MT"}.get(value, value)
    if value not in {str(i) for i in range(1, 23)} | {"X", "Y", "MT"}:
        raise ValueError("unsupported_chromosome")
    return value

def download(url, destination, terms_reviewed=False):
    """Explicit opt-in downloads; never accept data-use conditions on a user's behalf."""
    allowed = {"jenger.riken.jp", "humandbs.dbcls.jp", "humandbs.biosciencedbc.jp", "ddbj.nig.ac.jp", "www.ddbj.nig.ac.jp", "jmorp.megabank.tohoku.ac.jp"}
    def check(candidate):
        parsed = urlsplit(candidate)
        if parsed.hostname not in allowed or parsed.scheme not in {"http", "https"} or parsed.username or parsed.password:
            raise ValueError("unapproved_download_origin")
        if parsed.scheme == "http" and parsed.hostname != "jenger.riken.jp":
            raise ValueError("HTTPS_required")
    if not terms_reviewed:
        raise ValueError("Review the selected dataset terms first")
    check(url)
    # No automatic cross-origin redirects (including login / terms pages).
    from urllib.request import HTTPRedirectHandler, build_opener
    class CheckedRedirect(HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            check(newurl)
            return super().redirect_request(req, fp, code, msg, headers, newurl)
    destination = Path(destination)
    if destination.exists():
        raise FileExistsError(destination)
    with build_opener(CheckedRedirect()).open(url, timeout=60) as response:
        if "text/html" in response.headers.get("Content-Type", ""):
            raise ValueError("HTML returned instead of statistics; inspect dataset access page")
        with destination.open("xb") as out:
            for block in iter(lambda: response.read(1024 * 1024), b""):
                out.write(block)
    return {"url": url, "path": str(destination), "sha256": digest(destination)}

class Chain:
    """UCSC t genome = source; q genome = destination. Half-open block intervals."""
    def __init__(self, path):
        self.bins = {}
        with textfile(path) as stream:
            for line in stream:
                fields = line.split()
                if not fields:
                    continue
                if fields[0] == "chain":
                    _, _, tc, _, ts, tp, _, qc, qs, strand, qp, _, _ = fields
                    if ts != "+":
                        raise ValueError("Unsupported source chain strand")
                    try:
                        tc, qc = chrom(tc), chrom(qc)
                    except ValueError:
                        tc = None  # skip alternative contigs
                    tp, qp, qs = int(tp), int(qp), int(qs)
                else:
                    size = int(fields[0])
                    block = (tp, tp + size, qc, qp, qs, strand)
                    if tc:
                        for bucket in range(tp // 1000000, (tp + size - 1) // 1000000 + 1):
                            self.bins.setdefault((tc, bucket), []).append(block)
                    tp += size
                    qp += size
                    if len(fields) == 3:
                        tp += int(fields[1])
                        qp += int(fields[2])

    def map(self, chromosome, pos):
        zero = pos - 1
        hits = []
        for start, end, qc, qp, qs, strand in self.bins.get((chromosome, zero // 1000000), []):
            if start <= zero < end:
                target = qp + zero - start
                if strand == "-":
                    target = qs - target - 1
                hits.append((qc, target + 1, strand))
        # Even duplicate mappings remain ambiguous rather than being silently deduplicated.
        if len(hits) != 1:
            raise ValueError("unmapped" if not hits else "multiple_mappings")
        if hits[0][0] != chromosome:
            raise ValueError("cross_chromosome_mapping")
        return hits[0]

class Fasta:
    def __init__(self, path):
        self.path = Path(path)
        self.index = {}
        with open(str(path) + ".fai") as stream:
            for line in stream:
                name, length, offset, bases, width, *_ = line.rstrip().split("\t")
                try:
                    key = chrom(name)
                except ValueError:
                    continue
                if key in self.index:
                    raise ValueError("duplicate_reference_contig")
                self.index[key] = tuple(map(int, (length, offset, bases, width)))
        self.stream = open(path, "rb")

    def base(self, chromosome, pos):
        length, offset, bases, width = self.index[chromosome]
        if not 1 <= pos <= length:
            raise ValueError("position_out_of_reference")
        zero = pos - 1
        self.stream.seek(offset + zero // bases * width + zero % bases)
        return self.stream.read(1).decode("ascii").upper()

    def close(self):
        self.stream.close()

def normalize(row, columns, effect_scale):
    out = {field: row[column].strip() for field, column in columns.items()}
    for field in ("CHR", "POS", "REF", "ALT", "EA", "OA", "BETA", "SE", "P"):
        if field not in out:
            raise ValueError("missing_column_" + field)
    out["CHR"] = chrom(out["CHR"])
    out["POS"] = int(out["POS"])
    if out["POS"] < 1:
        raise ValueError("invalid_position")
    for field in ("REF", "ALT", "EA", "OA"):
        out[field] = out[field].upper()
        if out[field] not in {"A", "C", "G", "T"}:
            raise ValueError("non_SNP_requires_variant_aware_liftover")
    if out["REF"] == out["ALT"] or {out["EA"], out["OA"]} != {out["REF"], out["ALT"]}:
        raise ValueError("allele_mismatch")
    for field in ("BETA", "SE", "P"):
        out[field] = float(out[field])
        if not math.isfinite(out[field]):
            raise ValueError("nonfinite_" + field)
    if effect_scale == "OR":
        if out["BETA"] <= 0:
            raise ValueError("invalid_OR")
        out["BETA"] = math.log(out["BETA"])
    elif effect_scale != "beta":
        raise ValueError("effect_scale must be beta or OR; SE must be on beta/logOR scale")
    if out["SE"] <= 0 or not 0 < out["P"] <= 1:
        raise ValueError("invalid_SE_or_P; underflowed P needs explicit source handling")
    if out.get("EAF", ""):
        out["EAF"] = float(out["EAF"])
        if not math.isfinite(out["EAF"]) or not 0 <= out["EAF"] <= 1:
            raise ValueError("invalid_EAF")
    return out

def panel_frequencies(path, keys, info_key="AF"):
    found = {}
    with textfile(path) as stream:
        for line in stream:
            if line.startswith("#"):
                continue
            fields = line.rstrip().split("\t")
            chromosome, pos, _, ref, alternatives = fields[:5]
            try:
                chromosome = chrom(chromosome)
            except ValueError:
                continue
            info = dict(item.split("=", 1) for item in fields[7].split(";") if "=" in item)
            values = info.get(info_key, "").split(",")
            alts = alternatives.split(",")
            if len(values) != len(alts):
                continue
            for alt, raw in zip(alts, values):
                key = (chromosome, int(pos), ref.upper(), alt.upper())
                if key not in keys:
                    continue
                try:
                    af = float(raw)
                except ValueError:
                    continue
                if not math.isfinite(af) or not 0 <= af <= 1:
                    continue
                found[key] = None if key in found else af  # duplicate records cannot pick an arbitrary AF
    return found

def prepare(spec, target_build, reference, chain=None, panel=None):
    if spec["build"] not in BUILDS or target_build not in BUILDS:
        raise ValueError("Explicit GRCh37/GRCh38 required")
    if spec.get("position_base") != 1 or not spec.get("alleles_reviewed"):
        raise ValueError("Confirm 1-based positions and documented REF/ALT/effect alleles")
    if spec["build"] != target_build and chain is None:
        raise ValueError("Cross-build conversion requires a reviewed chain")
    rows, rejects, seen = [], [], set()
    first_rows = {}
    with textfile(spec["path"]) as stream:
        for number, raw in enumerate(csv.DictReader(stream, delimiter=spec.get("delimiter", "\t")), 2):
            try:
                row = normalize(raw, spec["columns"], spec["effect_scale"])
                original = (row["CHR"], row["POS"], row["REF"], row["ALT"])
                row["SOURCE_VARIANT"] = ":".join(map(str, original))
                if spec["build"] != target_build:
                    row["CHR"], row["POS"], strand = chain.map(row["CHR"], row["POS"])
                    if strand == "-":
                        for field in ("REF", "ALT", "EA", "OA"):
                            row[field] = row[field].translate(COMPLEMENT)
                if reference.base(row["CHR"], row["POS"]) != row["REF"]:
                    raise ValueError("target_reference_mismatch")
                key = (row["CHR"], row["POS"], row["REF"], row["ALT"])
                if key in seen:
                    first = first_rows.pop(key, None)
                    if first is not None:
                        previous, previous_number, previous_raw = first
                        rows.remove(previous)
                        rejects.append({"line": previous_number, "reason": "duplicate_target_variant", "raw": json.dumps(previous_raw)})
                    raise ValueError("duplicate_target_variant")
                seen.add(key)
                row["BUILD"] = target_build
                rows.append(row)
                first_rows[key] = (row, number, raw)
            except (ValueError, KeyError) as error:
                rejects.append({"line": number, "reason": str(error), "raw": json.dumps(raw)})
    if panel:
        if panel["build"] != target_build or not panel.get("terms_reviewed") or not panel.get("version"):
            raise ValueError("jMorp requires matching build, panel version and terms review")
        frequencies = panel_frequencies(panel["path"], seen, panel.get("af_info_key", "AF"))
        for row in rows:
            key = (row["CHR"], row["POS"], row["REF"], row["ALT"])
            af = frequencies.get(key)
            row["JMORP_ALT_AF"] = "" if af is None else af
            row["JMORP_EA_AF"] = "" if af is None else af if row["EA"] == row["ALT"] else 1 - af
            row["JMORP_VERSION"] = panel["version"]
            row["JMORP_STATUS"] = "matched" if af is not None else "missing_or_ambiguous"
            # jMorp AF is a population annotation; never fill the GWAS study's EAF with it.
    return rows, rejects

def write_tsv(path, rows):
    if not rows:
        raise ValueError("No usable variants; inspect rejection log")
    with open(path, "w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=sorted(set().union(*(row.keys() for row in rows))), delimiter="\t")
        writer.writeheader()
        writer.writerows(rows)

def run(config, destination):
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=False)
    target = config["target_build"]
    if target not in BUILDS or config["reference"]["build"] != target:
        raise ValueError("Reference build must equal target build")
    paths = [config["reference"]["path"], str(config["reference"]["path"]) + ".fai"]
    reference = Fasta(config["reference"]["path"])
    counts = {}
    try:
        for kind in ("exposure", "outcome"):
            spec = config[kind]
            paths.append(spec["path"])
            chain = None
            if spec["build"] != target:
                chain_spec = config["chains"][spec["build"] + "_to_" + target]
                if chain_spec["from"] != spec["build"] or chain_spec["to"] != target:
                    raise ValueError("chain_direction_mismatch")
                if digest(chain_spec["path"]) != chain_spec["sha256"]:
                    raise ValueError("chain_checksum_mismatch")
                paths.append(chain_spec["path"])
                chain = Chain(chain_spec["path"])
            rows, rejects = prepare(spec, target, reference, chain, config.get("jmorp"))
            (destination / (kind + "_rejected.json")).write_text(json.dumps(rejects, indent=2), encoding="utf-8")
            write_tsv(destination / (kind + ".tsv"), rows)
            counts[kind] = {"accepted": len(rows), "rejected": len(rejects)}
        if config.get("jmorp"):
            paths.append(config["jmorp"]["path"])
        manifest = {"status": "prepared; MR not executed", "config": config, "counts": counts,
                    "inputs": {str(path): digest(path) for path in set(paths)},
                    "outputs": {p.name: digest(p) for p in destination.iterdir() if p.is_file()}}
        (destination / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        return manifest
    finally:
        reference.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("config")
    parser.add_argument("destination")
    args = parser.parse_args()
    print(json.dumps(run(json.loads(Path(args.config).read_text(encoding="utf-8")), args.destination)["counts"], indent=2))

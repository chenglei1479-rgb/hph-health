# BBJ two-sample MR companion. Invoked by BBJ_MR.ipynb only after explicit plan approval.
args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 2) stop("Usage: Rscript bbj_mr.R config.json prepared_directory")
for (pkg in c("jsonlite", "TwoSampleMR", "ieugwasr", "digest")) {
  if (!requireNamespace(pkg, quietly = TRUE)) stop(paste("Missing R package:", pkg))
}
config <- jsonlite::fromJSON(args[1], simplifyVector = FALSE)
mr <- config$mr
if (!isTRUE(mr$researcher_approved) || !isTRUE(mr$overlap_reviewed) ||
    !is.character(mr$overlap_notes) || !nzchar(mr$overlap_notes)) {
  stop("Researcher approval and documented sample-overlap review required; two BBJ traits may share participants")
}
if (!(mr$ld_ancestry %in% c("JPN", "EAS"))) stop("Use a Japanese/EAS local LD reference")
if (!identical(mr$ld_build, config$target_build)) stop("LD reference build must match the prepared variants")
if (!file.exists(mr$plink) || !all(file.exists(paste0(mr$ld_bfile, c(".bed", ".bim", ".fam"))))) stop("Local PLINK / LD reference missing")
directory <- args[2]
manifest <- jsonlite::fromJSON(file.path(directory, "manifest.json"), simplifyVector = FALSE)
if (!identical(manifest$config$target_build, config$target_build) ||
    !identical(manifest$config$exposure, config$exposure) ||
    !identical(manifest$config$outcome, config$outcome)) stop("Prepared provenance does not match config; rerun preparation")
for (name in c("exposure.tsv", "outcome.tsv")) {
  if (!identical(digest::digest(file = file.path(directory, name), algo = "sha256"), manifest$outputs[[name]])) stop("Prepared data checksum changed")
}
for (suffix in c(".bed", ".bim", ".fam")) {
  writeLines(paste(suffix, digest::digest(file = paste0(mr$ld_bfile, suffix), algo = "sha256")),
             file.path(directory, paste0("ld", suffix, ".sha256")))
}
load_trait <- function(kind) {
  dat <- read.delim(file.path(directory, paste0(kind, ".tsv")), stringsAsFactors = FALSE)
  if (!all(dat$BUILD == config$target_build)) stop("Mixed genome builds")
  # LD reference needs real rsIDs. Chromosome-position IDs cannot silently replace them.
  if (!"SNP" %in% names(dat) || any(!grepl("^rs[0-9]+$", dat$SNP)) || anyDuplicated(dat$SNP)) stop("Unique documented rsIDs required for local LD clumping")
  if (!"EAF" %in% names(dat)) dat$EAF <- NA_real_
  # Drop all palindromes conservatively; jMorp annotation is never substituted for study EAF.
  palindrome <- (dat$EA == "A" & dat$OA == "T") | (dat$EA == "T" & dat$OA == "A") |
                (dat$EA == "C" & dat$OA == "G") | (dat$EA == "G" & dat$OA == "C")
  write.csv(dat[palindrome, ], file.path(directory, paste0(kind, "_palindromes.csv")), row.names = FALSE)
  dat <- dat[!palindrome, ]
  dat$trait <- config[[kind]]$trait
  TwoSampleMR::format_data(dat, type = kind, snp_col = "SNP", beta_col = "BETA", se_col = "SE",
                           effect_allele_col = "EA", other_allele_col = "OA", eaf_col = "EAF",
                           pval_col = "P", phenotype_col = "trait")
}
exposure <- load_trait("exposure")
outcome <- load_trait("outcome")
exposure$F_stat <- (exposure$beta.exposure / exposure$se.exposure)^2
exposure <- exposure[exposure$pval.exposure < 5e-8 & exposure$F_stat >= 10, ]
if (nrow(exposure) == 0) stop("No genome-wide significant instruments with F >= 10")
ld <- ieugwasr::ld_clump(data.frame(rsid = exposure$SNP, pval = exposure$pval.exposure, id = exposure$id.exposure),
                        clump_kb = 10000, clump_r2 = 0.001, clump_p = 1,
                        bfile = mr$ld_bfile, plink_bin = mr$plink)
write.csv(exposure[!exposure$SNP %in% ld$rsid, ], file.path(directory, "clumping_removed.csv"), row.names = FALSE)
exposure <- exposure[exposure$SNP %in% ld$rsid, ]
# Coordinate/REF/ALT consistency must be checked before rsID-based harmonisation.
x <- read.delim(file.path(directory, "exposure.tsv"), stringsAsFactors = FALSE)
y <- read.delim(file.path(directory, "outcome.tsv"), stringsAsFactors = FALSE)
common <- intersect(exposure$SNP, outcome$SNP)
xx <- x[match(common, x$SNP), ]; yy <- y[match(common, y$SNP), ]
if (any(xx$CHR != yy$CHR | xx$POS != yy$POS | xx$REF != yy$REF | xx$ALT != yy$ALT)) stop("rsID points to incompatible variants")
harmonised <- TwoSampleMR::harmonise_data(exposure, outcome, action = 3)
write.csv(harmonised, file.path(directory, "harmonised_all.csv"), row.names = FALSE)
dat <- harmonised[harmonised$mr_keep, ]
if (nrow(dat) < 3) stop("Fewer than three independent harmonised SNPs; this template requires >=3")
results <- TwoSampleMR::mr(dat, method_list = c("mr_ivw", "mr_egger_regression", "mr_weighted_median"))
write.csv(results, file.path(directory, "mr_results.csv"), row.names = FALSE)
write.csv(TwoSampleMR::mr_heterogeneity(dat), file.path(directory, "heterogeneity.csv"), row.names = FALSE)
write.csv(TwoSampleMR::mr_pleiotropy_test(dat), file.path(directory, "egger_intercept.csv"), row.names = FALSE)
write.csv(TwoSampleMR::mr_leaveoneout(dat), file.path(directory, "leave_one_out.csv"), row.names = FALSE)
single <- TwoSampleMR::mr_singlesnp(dat)
write.csv(single, file.path(directory, "single_snp.csv"), row.names = FALSE)
pdf(file.path(directory, "mr_diagnostics.pdf"), width = 9, height = 7)
for (plot in TwoSampleMR::mr_scatter_plot(results, dat)) print(plot)
for (plot in TwoSampleMR::mr_forest_plot(single)) print(plot)
for (plot in TwoSampleMR::mr_funnel_plot(single)) print(plot)
dev.off()
writeLines(c(capture.output(sessionInfo()), paste("LD ancestry:", mr$ld_ancestry),
             paste("Sample overlap:", mr$overlap_notes),
             "Estimates require MR assumption review; no automatic causal/clinical conclusion."),
           file.path(directory, "mr_session.txt"))
artifacts <- list.files(directory, full.names = TRUE)
artifact_hashes <- setNames(lapply(artifacts, function(path) digest::digest(file = path, algo = "sha256")), basename(artifacts))
jsonlite::write_json(list(status = "MR executed; interpretation requires researcher review",
                         completed_at = format(Sys.time(), tz = "UTC", usetz = TRUE),
                         independent_harmonised_snps = nrow(dat), overlap_notes = mr$overlap_notes,
                         artifacts = artifact_hashes), file.path(directory, "mr_run.json"), pretty = TRUE, auto_unbox = TRUE)

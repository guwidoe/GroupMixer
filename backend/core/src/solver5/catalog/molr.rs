use super::CatalogSource;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct MolrCatalogEntry {
    pub(crate) num_groups: usize,
    pub(crate) group_size: usize,
    pub(crate) base_weeks: usize,
    pub(crate) group_fill_week: &'static [&'static [usize]],
    pub(crate) citation: &'static str,
}

const MOLR_SOURCE: CatalogSource = CatalogSource {
    name: "molr_catalog",
    citation: "Catalog-backed MOLR/MOLS lower-bound cases from cited literature constructions",
};

const CASE_10_10_GROUP_FILL_WEEK: &[&[usize]] = &[
    &[12, 24, 27, 30, 35, 41, 53, 62, 80, 86],
    &[8, 16, 34, 42, 45, 48, 49, 77, 85, 95],
    &[3, 13, 18, 19, 29, 46, 47, 56, 65, 84],
    &[40, 44, 50, 55, 57, 71, 75, 83, 88, 98],
    &[4, 9, 39, 54, 63, 69, 72, 78, 94, 99],
    &[5, 11, 22, 25, 36, 60, 67, 73, 79, 89],
    &[0, 7, 14, 21, 31, 32, 61, 70, 74, 76],
    &[1, 15, 17, 26, 28, 43, 51, 52, 58, 81],
    &[20, 33, 37, 38, 64, 68, 82, 90, 92, 93],
    &[2, 6, 10, 23, 59, 66, 87, 91, 96, 97],
];

const CASES: &[MolrCatalogEntry] = &[
    MolrCatalogEntry {
        num_groups: 10,
        group_size: 10,
        base_weeks: 3,
        group_fill_week: CASE_10_10_GROUP_FILL_WEEK,
        citation: "MOLRs(10,10)+G(1) route from Miller–Valkov–Abel 2026 Table B19; the shipped 10-10-4 construction extends a validated 10-10-3 base schedule with a compatible latent-group partition synthesized and validity-checked in solver5",
    },
];

pub(crate) fn exact_case(num_groups: usize, group_size: usize) -> Option<&'static MolrCatalogEntry> {
    CASES
        .iter()
        .find(|entry| entry.num_groups == num_groups && entry.group_size == group_size)
}

pub(crate) fn source() -> CatalogSource {
    MOLR_SOURCE
}

use super::CatalogSource;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct RitdCatalogEntry {
    pub(crate) num_groups: usize,
    pub(crate) group_size: usize,
    pub(crate) itd_rows: &'static [&'static [&'static [usize]]],
    pub(crate) source_group_size: usize,
    pub(crate) complete_parallel_classes: usize,
    pub(crate) add_group_fill_week: bool,
    pub(crate) citation: &'static str,
}

const RITD_SOURCE: CatalogSource = CatalogSource {
    name: "ritd_catalog",
    citation: "Catalog-backed resolvable incomplete transversal design cases from cited literature constructions",
};

const ITD_10_2_6_ROW_0: &[&[usize]] = &[
    &[0, 12, 24, 35, 46, 58],
    &[0, 14, 26, 38, 41, 52],
    &[0, 16, 22, 34, 48, 57],
    &[0, 11, 28, 32, 42, 55],
    &[0, 18, 23, 31, 44, 51],
    &[0, 10, 25, 30, 43, 59],
    &[0, 17, 27, 39, 47, 56],
    &[0, 15, 20, 33, 49, 50],
    &[0, 13, 29, 37, 45, 53],
    &[0, 19, 21, 36, 40, 54],
];

const ITD_10_2_6_ROW_1: &[&[usize]] = &[
    &[1, 13, 25, 36, 47, 58],
    &[1, 15, 27, 38, 42, 53],
    &[1, 17, 23, 35, 48, 54],
    &[1, 12, 28, 33, 43, 56],
    &[1, 18, 20, 32, 45, 52],
    &[1, 11, 26, 31, 40, 59],
    &[1, 14, 24, 39, 44, 57],
    &[1, 16, 21, 30, 49, 51],
    &[1, 10, 29, 34, 46, 50],
    &[1, 19, 22, 37, 41, 55],
];

const ITD_10_2_6_ROW_2: &[&[usize]] = &[
    &[2, 10, 26, 37, 44, 58],
    &[2, 16, 24, 38, 43, 50],
    &[2, 14, 20, 36, 48, 55],
    &[2, 13, 28, 30, 40, 57],
    &[2, 18, 21, 33, 46, 53],
    &[2, 12, 27, 32, 41, 59],
    &[2, 15, 25, 39, 45, 54],
    &[2, 17, 22, 31, 49, 52],
    &[2, 11, 29, 35, 47, 51],
    &[2, 19, 23, 34, 42, 56],
];

const ITD_10_2_6_ROW_3: &[&[usize]] = &[
    &[3, 11, 27, 34, 45, 58],
    &[3, 17, 25, 38, 40, 51],
    &[3, 15, 21, 37, 48, 56],
    &[3, 10, 28, 31, 41, 54],
    &[3, 18, 22, 30, 47, 50],
    &[3, 13, 24, 33, 42, 59],
    &[3, 16, 26, 39, 46, 55],
    &[3, 14, 23, 32, 49, 53],
    &[3, 12, 29, 36, 44, 52],
    &[3, 19, 20, 35, 43, 57],
];

const ITD_10_2_6_ROW_4: &[&[usize]] = &[
    &[4, 16, 20, 31, 42, 58],
    &[4, 10, 22, 38, 45, 56],
    &[4, 12, 26, 30, 48, 53],
    &[4, 15, 28, 36, 46, 51],
    &[4, 18, 27, 35, 40, 55],
    &[4, 14, 21, 34, 47, 59],
    &[4, 13, 23, 39, 43, 52],
    &[4, 11, 24, 37, 49, 54],
    &[4, 17, 29, 33, 41, 57],
    &[4, 19, 25, 32, 44, 50],
];

const ITD_10_2_6_ROW_5: &[&[usize]] = &[
    &[5, 17, 21, 32, 43, 58],
    &[5, 11, 23, 38, 46, 57],
    &[5, 13, 27, 31, 48, 50],
    &[5, 16, 28, 37, 47, 52],
    &[5, 18, 24, 36, 41, 56],
    &[5, 15, 22, 35, 44, 59],
    &[5, 10, 20, 39, 40, 53],
    &[5, 12, 25, 34, 49, 55],
    &[5, 14, 29, 30, 42, 54],
    &[5, 19, 26, 33, 45, 51],
];

const ITD_10_2_6_ROW_6: &[&[usize]] = &[
    &[6, 14, 22, 33, 40, 58],
    &[6, 12, 20, 38, 47, 54],
    &[6, 10, 24, 32, 48, 51],
    &[6, 17, 28, 34, 44, 53],
    &[6, 18, 25, 37, 42, 57],
    &[6, 16, 23, 36, 45, 59],
    &[6, 11, 21, 39, 41, 50],
    &[6, 13, 26, 35, 49, 56],
    &[6, 15, 29, 31, 43, 55],
    &[6, 19, 27, 30, 46, 52],
];

const ITD_10_2_6_ROW_7: &[&[usize]] = &[
    &[7, 15, 23, 30, 41, 58],
    &[7, 13, 21, 38, 44, 55],
    &[7, 11, 25, 33, 48, 52],
    &[7, 14, 28, 35, 45, 50],
    &[7, 18, 26, 34, 43, 54],
    &[7, 17, 20, 37, 46, 59],
    &[7, 12, 22, 39, 42, 51],
    &[7, 10, 27, 36, 49, 57],
    &[7, 16, 29, 32, 40, 56],
    &[7, 19, 24, 31, 47, 53],
];

const ITD_10_2_6_ROW_8: &[&[usize]] = &[
    &[8, 10, 21, 35, 42, 52],
    &[8, 11, 22, 36, 43, 53],
    &[8, 12, 23, 37, 40, 50],
    &[8, 13, 20, 34, 41, 51],
    &[8, 14, 25, 31, 46, 56],
    &[8, 15, 26, 32, 47, 57],
    &[8, 16, 27, 33, 44, 54],
    &[8, 17, 24, 30, 45, 55],
];

const ITD_10_2_6_ROW_9: &[&[usize]] = &[
    &[9, 10, 23, 33, 47, 55],
    &[9, 11, 20, 30, 44, 56],
    &[9, 12, 21, 31, 45, 57],
    &[9, 13, 22, 32, 46, 54],
    &[9, 14, 27, 37, 43, 51],
    &[9, 15, 24, 34, 40, 52],
    &[9, 16, 25, 35, 41, 53],
    &[9, 17, 26, 36, 42, 50],
];

const ITD_10_2_6_ROWS: &[&[&[usize]]] = &[
    ITD_10_2_6_ROW_0,
    ITD_10_2_6_ROW_1,
    ITD_10_2_6_ROW_2,
    ITD_10_2_6_ROW_3,
    ITD_10_2_6_ROW_4,
    ITD_10_2_6_ROW_5,
    ITD_10_2_6_ROW_6,
    ITD_10_2_6_ROW_7,
    ITD_10_2_6_ROW_8,
    ITD_10_2_6_ROW_9,
];

const CASES: &[RitdCatalogEntry] = &[
    RitdCatalogEntry {
        num_groups: 10,
        group_size: 5,
        itd_rows: ITD_10_2_6_ROWS,
        source_group_size: 10,
        complete_parallel_classes: 8,
        add_group_fill_week: true,
        citation: "RITD(10,2;5) route derived from the ITD(10,2;6) block set shown in Miller–Valkov–Abel 2026 Figure 8 / Example 3; removing one size-10 group yields eight complete parallel classes on 50 points, and one additional intra-group week yields the paper's RITD(10,2;5)+G(1) 9-round construction",
    },
];

pub(crate) fn exact_case(num_groups: usize, group_size: usize) -> Option<&'static RitdCatalogEntry> {
    CASES
        .iter()
        .find(|entry| entry.num_groups == num_groups && entry.group_size == group_size)
}

pub(crate) fn source() -> CatalogSource {
    RITD_SOURCE
}

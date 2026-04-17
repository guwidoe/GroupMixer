use super::CatalogSource;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct QdmCatalogEntry {
    pub(crate) num_groups: usize,
    pub(crate) group_size: usize,
    pub(crate) qdm_group_order: usize,
    pub(crate) encoded_columns: &'static [[i8; 6]],
    pub(crate) citation: &'static str,
}

const QDM_SOURCE: CatalogSource = CatalogSource {
    name: "qdm_catalog",
    citation: "Catalog-backed quasi-difference matrices from the Sage combinatorial-designs database / Handbook of Combinatorial Designs",
};

const QDM_19_6_1_1_1_COLUMNS: [[i8; 6]; 21] = [
    [-1, 0, 0, 7, 1, 11],
    [0, 0, -1, 11, 7, 1],
    [0, -1, 0, 1, 11, 7],
    [7, 1, 11, -1, 0, 0],
    [1, 11, 7, 0, -1, 0],
    [11, 7, 1, 0, 0, -1],
    [13, 15, 10, 13, 15, 10],
    [15, 10, 13, 10, 13, 15],
    [10, 13, 15, 15, 10, 13],
    [1, 7, 11, 16, 17, 5],
    [7, 11, 1, 5, 16, 17],
    [11, 1, 7, 17, 5, 16],
    [16, 17, 5, 1, 7, 11],
    [17, 5, 16, 11, 1, 7],
    [5, 16, 17, 7, 11, 1],
    [9, 6, 4, 2, 14, 3],
    [6, 4, 9, 3, 2, 14],
    [4, 9, 6, 14, 3, 2],
    [2, 14, 3, 9, 6, 4],
    [14, 3, 2, 4, 9, 6],
    [3, 2, 14, 6, 4, 9],
];

const CASES: &[QdmCatalogEntry] = &[
    QdmCatalogEntry {
        num_groups: 20,
        group_size: 5,
        qdm_group_order: 19,
        encoded_columns: &QDM_19_6_1_1_1_COLUMNS,
        citation: "Explicit (19,6;1,1;1)-QDM from the Sage combinatorial-designs database (Handbook of Combinatorial Designs III.3.49), yielding OA(6,20) and hence RTD(5,20)",
    },
];

pub(crate) fn source() -> &'static CatalogSource {
    &QDM_SOURCE
}

pub(crate) fn exact_case(num_groups: usize, group_size: usize) -> Option<&'static QdmCatalogEntry> {
    CASES
        .iter()
        .find(|entry| entry.num_groups == num_groups && entry.group_size == group_size)
}

use super::CatalogSource;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct OwnSgCatalogEntry {
    pub(crate) num_groups: usize,
    pub(crate) group_size: usize,
    pub(crate) starter_blocks: &'static [&'static [usize]],
    pub(crate) citation: &'static str,
}

const OWNSG_SOURCE: CatalogSource = CatalogSource {
    name: "ownsg_catalog",
    citation: "Catalog-backed ownSG starter-block bank from Miller–Valkov–Abel 2026, Appendix A / Construction 5",
};

const OWNSG_60_6_STARTERS: &[&[usize]] = &[
    &[0, 1, 2, 3, 4, 5],
    &[0, 7, 14, 21, 28, 35],
    &[0, 8, 13, 23, 33, 46],
    &[0, 9, 17, 19, 34, 50],
    &[0, 11, 15, 32, 49, 58],
    &[0, 16, 25, 41, 44, 57],
    &[0, 20, 29, 40, 43, 51],
];

const OWNSG_70_7_STARTERS: &[&[usize]] = &[
    &[0, 1, 2, 3, 4, 5, 6],
    &[0, 8, 16, 24, 32, 40, 48],
    &[0, 9, 15, 26, 38, 60, 69],
    &[0, 10, 19, 25, 30, 43, 55],
    &[0, 12, 27, 44, 53, 59, 64],
    &[0, 13, 18, 22, 31, 61, 65],
    &[0, 17, 23, 34, 54, 57, 67],
];

const OWNSG_80_8_STARTERS: &[&[usize]] = &[
    &[0, 1, 2, 3, 4, 5, 6, 7],
    &[0, 9, 18, 27, 36, 45, 54, 63],
    &[0, 10, 17, 29, 39, 43, 68, 78],
    &[0, 11, 22, 25, 44, 55, 69, 74],
    &[0, 19, 31, 38, 42, 53, 65, 76],
];

const OWNSG_90_9_STARTERS: &[&[usize]] = &[
    &[0, 1, 2, 3, 4, 5, 6, 7, 8],
    &[0, 10, 20, 30, 40, 50, 60, 70, 80],
    &[0, 11, 19, 33, 44, 52, 57, 68, 76],
    &[0, 13, 26, 32, 37, 48, 61, 69, 74],
    &[0, 17, 22, 34, 38, 51, 59, 66, 73],
];

const CASES: &[OwnSgCatalogEntry] = &[
    OwnSgCatalogEntry {
        num_groups: 10,
        group_size: 6,
        starter_blocks: OWNSG_60_6_STARTERS,
        citation: "Starter blocks for ownSG(60,6) with 7 rounds from Miller–Valkov–Abel 2026, Appendix A Table A1",
    },
    OwnSgCatalogEntry {
        num_groups: 10,
        group_size: 7,
        starter_blocks: OWNSG_70_7_STARTERS,
        citation: "Starter blocks for ownSG(70,7) with 7 rounds from Miller–Valkov–Abel 2026, Appendix A Table A1",
    },
    OwnSgCatalogEntry {
        num_groups: 10,
        group_size: 8,
        starter_blocks: OWNSG_80_8_STARTERS,
        citation: "Starter blocks for ownSG(80,8) with 5 rounds from Miller–Valkov–Abel 2026, Appendix A Table A1",
    },
    OwnSgCatalogEntry {
        num_groups: 10,
        group_size: 9,
        starter_blocks: OWNSG_90_9_STARTERS,
        citation: "Starter blocks for ownSG(90,9) with 5 rounds from Miller–Valkov–Abel 2026, Appendix A Table A1",
    },
];

pub(crate) fn exact_case(
    num_groups: usize,
    group_size: usize,
) -> Option<&'static OwnSgCatalogEntry> {
    CASES
        .iter()
        .find(|entry| entry.num_groups == num_groups && entry.group_size == group_size)
}

pub(crate) fn source() -> CatalogSource {
    OWNSG_SOURCE
}
